var express = require('express');
var router = express.Router();
var { getTweets, deleteTweets } = require('../src/storage/db');

router.get('/', function(req, res) {
  var tweets = getTweets();
  res.render('bo/index.ejs', { tweets: tweets, title: 'Dashboard Tweets' });
});

router.post('/api/tweets/delete', function(req, res) {
  var ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Aucun ID fourni.' });
  }
  var result = deleteTweets(ids);
  res.json({ success: true, deleted: result.deleted, remaining: result.remaining });
});

module.exports = router;
