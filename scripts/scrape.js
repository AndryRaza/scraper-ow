#!/usr/bin/env node

const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets } = require('../src/storage/db');
const accounts = require('../src/config/accounts');
const logger = require('../src/utils/logger');

async function main() {
  if (accounts.length === 0) {
    logger.error('Aucun compte configuré. Éditez src/config/accounts.js');
    process.exit(1);
  }

  const scraper = new TwitterScraper();

  try {
    // headless: false pour la première connexion (login manuel)
    // Ensuite, une fois les cookies sauvegardés, tu peux passer à true
    await scraper.init(false);
    await scraper.ensureLoggedIn();

    for (const account of accounts) {
      const tweets = await scraper.scrapeAccount(account, 50);
      const { added, total } = addTweets(tweets);
      logger.info(`@${account}: ${added} nouveaux tweets (total DB: ${total})`);
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
