const express = require('express');
const router = express.Router();
const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets, getTweets } = require('../src/storage/db');
const accounts = require('../src/config/accounts');
const logger = require('../src/utils/logger');

/**
 * GET /api/tweets
 * Récupère les tweets stockés.
 * Query: ?account=elonmusk pour filtrer
 */
router.get('/tweets', (req, res) => {
  const { account } = req.query;
  try {
    const tweets = getTweets(account);
    res.json({
      success: true,
      count: tweets.length,
      account: account || null,
      tweets,
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scrape
 * Déclenche le scraping.
 * Body JSON optionnel:
 *   {
 *     "account": "elonmusk",  // si omis, scrape tous les comptes de la config
 *     "maxTweets": 30         // défaut 50
 *   }
 */
router.post('/scrape', async (req, res) => {
  const { account, maxTweets = 50 } = req.body || {};
  const targets = account ? [account] : accounts;

  if (!targets || targets.length === 0) {
    return res.status(400).json({
      success: false,
      error:
        'Aucun compte cible. Ajoutez des comptes dans src/config/accounts.js ou passez "account" dans le body.',
    });
  }

  const scraper = new TwitterScraper();
  const results = [];

  try {
    await scraper.init(false); // headless: false pour le login manuel la 1ère fois
    await scraper.ensureLoggedIn();

    for (const acc of targets) {
      const tweets = await scraper.scrapeAccount(acc, parseInt(maxTweets, 10));
      const { added, total } = addTweets(tweets);
      results.push({
        account: acc,
        scraped: tweets.length,
        added,
        totalInDb: total,
      });
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await scraper.close();
  }
});

module.exports = router;
