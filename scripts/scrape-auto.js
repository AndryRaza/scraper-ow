#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets } = require('../src/storage/db');
const accountsDb = require('../src/storage/accounts-db');
const logger = require('../src/utils/logger');

const COOKIES_PATH = path.join(__dirname, '../cookies/twitter-cookies.json');

/**
 * Mode automatique (sans interaction).
 * Échoue proprement si les cookies sont absents ou expirés.
 */
async function main() {
  var accounts = accountsDb.list().filter(function (a) { return a.enabled; });
  var handles = accounts.map(function (a) { return a.handle; });

  if (handles.length === 0) {
    logger.error('Aucun compte actif. Activez des comptes depuis le dashboard.');
    process.exit(1);
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    logger.error('Cookies manquants. Lancez "node scripts/scrape.js" manuellement une fois.');
    process.exit(1);
  }

  const scraper = new TwitterScraper();

  try {
    // headless: false toujours nécessaire (Twitter/X bloque le headless)
    await scraper.init(false, false);

    // autoMode: true = pas de prompt interactif, échec si cookies invalides
    await scraper.ensureLoggedIn(true);

    for (const handle of handles) {
      const tweets = await scraper.scrapeAccount(handle, 10);
      const { added, total } = addTweets(tweets);
      logger.info(`@${handle}: ${added} nouveaux tweets (total DB: ${total})`);
    }

    logger.info('Scraping automatique terminé.');
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main();
