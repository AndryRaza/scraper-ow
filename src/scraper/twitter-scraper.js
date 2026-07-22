const { chromium } = require('@playwright/test');
const { loadCookies, saveCookies } = require('./auth-helper');
const logger = require('../utils/logger');

class TwitterScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init(headless = false) {
    this.browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    const cookies = loadCookies();
    if (cookies && cookies.length > 0) {
      await this.context.addCookies(cookies);
      logger.info(`${cookies.length} cookies chargés`);
    }

    this.page = await this.context.newPage();

    // Masquer la propriété webdriver
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  /**
   * Vérifie la connexion. Si non connecté, attend le login manuel
   * et sauvegarde les cookies pour les prochaines sessions.
   */
  async ensureLoggedIn() {
    logger.info('Vérification de la connexion Twitter...');
    await this.page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
    await this.sleep(4000);

    const url = this.page.url();

    if (url.includes('/login') || url.includes('/i/flow/login')) {
      logger.warn('Non connecté. Un navigateur est ouvert.');
      logger.warn('Veuillez vous connecter MANUELLEMENT à Twitter dans ce navigateur.');
      logger.warn('La session sera sauvegardée automatiquement après connexion.');

      // Attendre que l'URL ne contienne plus /login (jusqu'à 3 minutes)
      await this.page.waitForURL(
        (u) => !u.pathname.includes('/login') && !u.pathname.includes('/i/flow/login'),
        { timeout: 180000 }
      );

      logger.info('Connexion détectée ! Sauvegarde des cookies...');
      const cookies = await this.context.cookies();
      saveCookies(cookies);
      logger.info(`${cookies.length} cookies sauvegardés`);
    } else {
      logger.info('Session déjà active.');
      const cookies = await this.context.cookies();
      saveCookies(cookies);
    }
  }

  /**
   * Scrape un compte Twitter/X
   */
  async scrapeAccount(account, maxTweets = 50) {
    logger.info(`Scraping de @${account} (max ${maxTweets} tweets)...`);

    const url = `https://twitter.com/${account}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.sleep(3000);

    // Gérer le cas "Ce compte n'existe pas" ou "Compte suspendu"
    const notFound = await this.page.locator('text=/doesn.t exist|suspended|introuvable/i').first().isVisible().catch(() => false);
    if (notFound) {
      logger.warn(`Le compte @${account} semble introuvable ou suspendu.`);
      return [];
    }

    // Attendre que des tweets apparaissent
    try {
      await this.page.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 });
    } catch (e) {
      logger.error(`Aucun tweet trouvé pour @${account} (timeout). Twitter a peut-être bloqué l'accès.`);
      return [];
    }

    const tweets = [];
    let noNewTweetCount = 0;
    const maxNoNew = 5;

    while (tweets.length < maxTweets && noNewTweetCount < maxNoNew) {
      const currentCount = tweets.length;

      const pageTweets = await this.page.evaluate((acc) => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const results = [];

        articles.forEach((article) => {
          try {
            // --- Date et URL ---
            const timeElem = article.querySelector('time');
            const date = timeElem ? timeElem.getAttribute('datetime') : null;
            const linkElem = timeElem ? timeElem.closest('a[href*="/status/"]') : null;
            const href = linkElem ? linkElem.getAttribute('href') : '';
            const tweetId = href.split('/status/')[1]?.split('/')[0] || Math.random().toString(36).slice(2);
            const tweetUrl = href.startsWith('http') ? href : `https://twitter.com${href}`;

            // --- Texte ---
            const textElem = article.querySelector('div[data-testid="tweetText"]');
            const text = textElem ? textElem.innerText.trim() : '';

            // --- Liens (dans le texte et les médias) ---
            const links = [];
            if (textElem) {
              textElem.querySelectorAll('a[href]').forEach((a) => {
                let link = a.getAttribute('href');
                if (link) {
                  if (link.startsWith('/')) link = `https://twitter.com${link}`;
                  if (!links.includes(link)) links.push(link);
                }
              });
            }
            // Liens externes affichés comme card
            article.querySelectorAll('a[href^="http"]').forEach((a) => {
              const link = a.getAttribute('href');
              if (link && !links.includes(link)) links.push(link);
            });

            // --- Retweets / stats ---
            // Twitter/X n'affiche pas toujours les nombres exacts sur la timeline.
            // On tente de lire les aria-label des boutons.
            let retweets = null;
            const retweetBtn = article.querySelector('button[data-testid="retweet"]');
            if (retweetBtn) {
              const label = retweetBtn.getAttribute('aria-label');
              if (label) {
                const match = label.match(/([\d\s,.]+)\s+reposts?/i) || label.match(/([\d\s,.]+)/);
                if (match) {
                  const raw = match[1].replace(/\s|,/g, '');
                  retweets = parseInt(raw, 10);
                }
              }
            }

            results.push({
              id: `${acc}_${tweetId}`,
              account: acc,
              text,
              date,
              tweetUrl,
              links,
              retweets,
              scrapedAt: new Date().toISOString(),
            });
          } catch (err) {
            // Ignorer silencieusement les éléments mal formés
          }
        });

        return results;
      }, account);

      // Fusion sans doublons
      pageTweets.forEach((t) => {
        if (!tweets.find((ex) => ex.id === t.id)) {
          tweets.push(t);
        }
      });

      if (tweets.length === currentCount) {
        noNewTweetCount++;
      } else {
        noNewTweetCount = 0;
      }

      // Scroll
      await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await this.sleep(2000 + Math.floor(Math.random() * 1500));
    }

    logger.info(`${tweets.length} tweets extraits pour @${account}`);
    return tweets.slice(0, maxTweets);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TwitterScraper;
