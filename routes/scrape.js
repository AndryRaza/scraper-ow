const express = require('express');
const router = express.Router();
const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets, getTweets } = require('../src/storage/db');
const cancelState = require('../src/scraper/cancel-state');
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
 * Un navigateur visible s'ouvrira pour maintenir la session.
 * Body JSON optionnel:
 *   {
 *     "account": "elonmusk",  // si omis, scrape tous les comptes de la config
 *     "maxTweets": 30         // défaut 10
 *   }
 */
router.post('/scrape', async (req, res) => {
  const { account, maxTweets = 10 } = req.body || {};
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
    cancelState.reset();

    await scraper.init(false, false);
    await scraper.ensureLoggedIn();

    for (const acc of targets) {
      cancelState.throwIfCancelled('Scraping annulé avant le prochain compte.');
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
    if (err.name === 'CancelError') {
      logger.info('Scraping annulé par l\'utilisateur.');
      res.json({ success: false, cancelled: true, results });
    } else {
      logger.error(err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  } finally {
    await scraper.close();
  }
});

/**
 * POST /api/scrape/cancel
 * Demande l'annulation du scraping en cours.
 */
router.post('/scrape/cancel', (req, res) => {
  cancelState.cancel();
  logger.info('Annulation du scraping demandée.');
  res.json({ success: true, message: 'Annulation demandée.' });
});

module.exports = router;
