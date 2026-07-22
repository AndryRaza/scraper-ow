#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets } = require('../src/storage/db');
const accountsDb = require('../src/storage/accounts-db');
const logger = require('../src/utils/logger');

const COOKIES_PATH = path.join(__dirname, '../cookies/twitter-cookies.json');

function printCookieGuide() {
  logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.warn('  COOKIES MANQUANTS');
  logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.warn('Aucun cookie Twitter/X trouvé dans :');
  logger.warn(`  ${COOKIES_PATH}`);
  logger.warn('');
  logger.warn('Pour générer les cookies :');
  logger.warn('1. Installe l\'extension "Cookie-Editor" dans Brave/Chrome');
  logger.warn('   https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfckkhgmhbfimlcfbgaacg');
  logger.warn('2. Connecte-toi à https://x.com dans Brave');
  logger.warn('3. Clique l\'icône Cookie-Editor → Export → JSON');
  logger.warn('4. Colle le JSON dans : cookies/twitter-cookies.json');
  logger.warn('');
  logger.warn('OU plus simple : lance une fois en manuel :');
  logger.warn('   node scripts/scrape.js');
  logger.warn('Le navigateur s\'ouvrira, connecte-toi, et les cookies');
  logger.warn('seront sauvegardés automatiquement.');
  logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function main() {
  var accounts = accountsDb.list().filter(function (a) { return a.enabled; });
  var handles = accounts.map(function (a) { return a.handle; });

  if (handles.length === 0) {
    logger.error('Aucun compte actif. Activez des comptes depuis le dashboard.');
    process.exit(1);
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    printCookieGuide();
    logger.info('');
    logger.info('Lancement du mode manuel (navigateur visible)...');
  }

  const scraper = new TwitterScraper();

  try {
    // headless: false = navigateur visible (obligatoire pour Twitter/X)
    // guest: false = mode connecté
    await scraper.init(false, false);
    await scraper.ensureLoggedIn();

    for (const handle of handles) {
      const tweets = await scraper.scrapeAccount(handle, 10);
      const { added, total } = addTweets(tweets);
      logger.info(`@${handle}: ${added} nouveaux tweets (total DB: ${total})`);
    }

    logger.info('Scraping terminé.');
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main();
