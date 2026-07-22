const express = require('express');
const router = express.Router();
const TwitterScraper = require('../src/scraper/twitter-scraper');
const { addTweets, getTweets } = require('../src/storage/db');
const cancelState = require('../src/scraper/cancel-state');
const accountsDb = require('../src/storage/accounts-db');
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
  var targets;
  if (account) {
    targets = [account];
  } else {
    targets = accountsDb.list()
      .filter(function (a) { return a.enabled; })
      .map(function (a) { return a.handle; });
  }

  if (!targets || targets.length === 0) {
    return res.status(400).json({
      success: false,
      error:
        'Aucun compte cible. Ajoutez des comptes depuis le dashboard ou passez "account" dans le body.',
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

/**
 * GET /api/tweets/list
 * Récupère les tweets avec pagination et tri.
 * Query params:
 *   page    - numéro de page (défaut 1)
 *   limit   - tweets par page (défaut 20, max 100)
 *   order   - "asc" ou "desc" (défaut "desc", tri par date)
 *   account - filtre optionnel par compte
 */
router.get('/tweets/list', (req, res) => {
  var page = parseInt(req.query.page, 10) || 1;
  var limit = parseInt(req.query.limit, 10) || 20;
  var order = req.query.order === 'asc' ? 'asc' : 'desc';
  var account = req.query.account || null;

  if (page < 1) page = 1;
  if (limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  try {
    var tweets = getTweets(account);

    tweets.sort(function (a, b) {
      var da = new Date(a.date || 0).getTime();
      var db = new Date(b.date || 0).getTime();
      return order === 'asc' ? da - db : db - da;
    });

    var total = tweets.length;
    var totalPages = Math.ceil(total / limit);
    var start = (page - 1) * limit;
    var paged = tweets.slice(start, start + limit);

    res.json({
      success: true,
      page: page,
      limit: limit,
      total: total,
      totalPages: totalPages,
      order: order,
      account: account,
      tweets: paged,
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/accounts
 * Liste les comptes configurés.
 */
router.get('/accounts', (req, res) => {
  try {
    var accounts = accountsDb.list();
    res.json({ success: true, accounts: accounts });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/accounts
 * Ajoute un compte à la liste.
 * Body: { "account": "elonmusk" }
 */
router.post('/accounts', (req, res) => {
  var account = req.body && req.body.account;
  if (!account) {
    return res.status(400).json({ success: false, error: 'Le champ "account" est requis.' });
  }
  try {
    var result = accountsDb.add(account);
    if (result.added) {
      res.json({ success: true, accounts: result.accounts });
    } else {
      res.status(409).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/accounts/:account
 * Supprime un compte de la liste.
 */
router.delete('/accounts/:account', (req, res) => {
  var account = req.params.account;
  try {
    var result = accountsDb.remove(account);
    if (result.removed) {
      res.json({ success: true, accounts: result.accounts });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/accounts/:account
 * Met à jour les propriétés d'un compte (ex: enabled).
 * Body: { "enabled": true }
 */
router.patch('/accounts/:account', (req, res) => {
  var account = req.params.account;
  var changes = req.body || {};
  try {
    var result = accountsDb.update(account, changes);
    if (result.updated) {
      res.json({ success: true, accounts: result.accounts });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
