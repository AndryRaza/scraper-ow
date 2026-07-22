const { chromium } = require('@playwright/test');
const readline = require('readline');
const { loadCookies, saveCookies, clearCookies } = require('./auth-helper');
const logger = require('../utils/logger');

class TwitterScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.guestMode = false;
  }

  /**
   * Lance Chromium avec des cookies chargés.
   * headless est toujours false pour le scraping connecté (Twitter/X
   * détecte les sessions headless et les bloque).
   */
  async init(headless = false, guest = false) {
    this.guestMode = guest;

    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
    });

    if (!guest) {
      const cookies = loadCookies();
      if (cookies && cookies.length > 0) {
        await this.context.addCookies(cookies);
        logger.info(`${cookies.length} cookies chargés`);
      }
    }

    this.page = await this.context.newPage();
  }

  /**
   * Vérifie la connexion Twitter/X.
   * @param {boolean} autoMode - true = pas de prompt interactif
   *                             (échoue proprement si cookies invalides)
   */
  async ensureLoggedIn(autoMode = false) {
    if (this.guestMode) {
      logger.info('Mode GUEST — pas de connexion requise.');
      return;
    }

    logger.info('Vérification de la connexion Twitter/X...');
    await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await this.sleep(4000);

    const url = this.page.url();

    // Pas de redirection vers login = session OK
    if (!url.includes('/login') && !url.includes('/i/flow/login')) {
      logger.info('Session OK.');
      const cookies = await this.context.cookies();
      saveCookies(cookies);
      return;
    }

    // Redirection login : cookies invalides
    clearCookies();

    if (autoMode) {
      throw new Error(
        'Cookies invalides ou expirés. ' +
        'Lance "node scripts/scrape.js" manuellement une fois pour régénérer les cookies, ' +
        'puis relance le mode automatique.'
      );
    }

    logger.warn('Cookies invalides — navigateur ouvert pour login manuel.');
    logger.warn('Connecte-toi à Twitter/X, puis appuie ENTRÉE dans ce terminal.');

    await this.page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await this.prompt('Appuie sur ENTRÉE quand tu es connecté...');

    logger.info('Vérification post-login...');
    await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await this.sleep(3000);

    if (this.page.url().includes('/login')) {
      throw new Error('Login manuel non confirmé.');
    }

    const cookies = await this.context.cookies();
    saveCookies(cookies);
    logger.info(`${cookies.length} cookies sauvegardés.`);
  }

  prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(question + '\n', () => {
        rl.close();
        resolve();
      });
    });
  }

  async dismissGuestPopups() {
    const dismissSelectors = [
      'div[role="dialog"] button[data-testid="app-bar-close"]',
      'div[role="dialog"] button[aria-label="Close"]',
    ];

    for (const sel of dismissSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        logger.info('Popup fermée.');
        await this.sleep(500);
      }
    }
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  async isBlocked() {
    const url = this.page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) return true;

    const challenge = await this.page
      .locator('text=/unsual activity|suspicious|confirm you.re human|rate limit/i')
      .first()
      .isVisible()
      .catch(() => false);
    if (challenge) return true;

    return false;
  }

  async scrapeAccount(account, maxTweets = 50) {
    logger.info(`Scraping de @${account} (max ${maxTweets} tweets)...`);

    await this.page.goto(`https://x.com/${account}`, { waitUntil: 'domcontentloaded' });
    await this.sleep(5000 + Math.floor(Math.random() * 3000));

    await this.dismissGuestPopups();

    if (await this.isBlocked()) {
      logger.error(`Accès bloqué pour @${account} (login ou challenge).`);
      try {
        const ssPath = `debug-blocked-${account}-${Date.now()}.png`;
        await this.page.screenshot({ path: ssPath, fullPage: true });
        logger.info(`Screenshot sauvegardé: ${ssPath}`);
      } catch (e) {}
      return [];
    }

    try {
      await this.page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    } catch (e) {
      logger.warn(`Aucun tweet visible pour @${account} après 15s, tentative anyway...`);
    }

    const tweets = [];
    let noNewTweetCount = 0;
    const maxNoNew = 5;

    while (tweets.length < maxTweets && noNewTweetCount < maxNoNew) {
      const currentCount = tweets.length;

      if (this.guestMode) {
        await this.dismissGuestPopups();
      }

      const pageTweets = await this.page.evaluate((acc) => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const results = [];

        articles.forEach((article) => {
          try {
            const timeElem = article.querySelector('time');
            const date = timeElem ? timeElem.getAttribute('datetime') : null;
            const linkElem = timeElem ? timeElem.closest('a[href*="/status/"]') : null;
            const href = linkElem ? linkElem.getAttribute('href') : '';
            const tweetId =
              href.split('/status/')[1]?.split('/')[0] ||
              Math.random().toString(36).slice(2);
            const tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;

            const textElem = article.querySelector('div[data-testid="tweetText"]');
            const text = textElem ? textElem.innerText.trim() : '';

            const links = [];
            if (textElem) {
              textElem.querySelectorAll('a[href]').forEach((a) => {
                let link = a.getAttribute('href');
                if (link) {
                  if (link.startsWith('/')) link = `https://x.com${link}`;
                  if (!links.includes(link)) links.push(link);
                }
              });
            }
            article.querySelectorAll('a[href^="http"]').forEach((a) => {
              const link = a.getAttribute('href');
              if (link && !links.includes(link)) links.push(link);
            });

            // let retweets = null;
            // const retweetBtn = article.querySelector('button[data-testid="retweet"]');
            // if (retweetBtn) {
            //   const label = retweetBtn.getAttribute('aria-label');
            //   if (label) {
            //     const match =
            //       label.match(/([\d\s,.]+)\s+reposts?/i) ||
            //       label.match(/([\d\s,.]+)/);
            //     if (match) {
            //       const raw = match[1].replace(/\s|,/g, '');
            //       retweets = parseInt(raw, 10);
            //     }
            //   }
            // }

            results.push({
              id: `${acc}_${tweetId}`,
              account: acc,
              text,
              date,
              tweetUrl,
              links,
              //retweets,
              //scrapedAt: new Date().toISOString(),
            });
          } catch (err) {
            // Ignorer
          }
        });

        return results;
      }, account);

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

      await this.page.evaluate(() => {
        const distance = window.innerHeight * (1.2 + Math.random() * 0.8);
        window.scrollBy({ top: distance, behavior: 'smooth' });
      });
      await this.sleep(2500 + Math.floor(Math.random() * 2500));
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
