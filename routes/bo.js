var express = require('express');
var router = express.Router();
var { getTweets, deleteTweets } = require('../src/storage/db');

router.get('/', function(req, res) {
  var tweets = getTweets();
  var totalTweets = tweets.length;

  var sortBy = req.query.sortBy || 'account';
  var sortOrder = req.query.sortOrder || 'asc';
  var nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';

  tweets = tweets.slice().sort(function(a, b) {
    var valA, valB;
    if (sortBy === 'date') {
      valA = a.date || '';
      valB = b.date || '';
    } else {
      valA = (a.account || '').toLowerCase();
      valB = (b.account || '').toLowerCase();
    }
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  var page = parseInt(req.query.page, 10) || 1;
  var perPage = parseInt(req.query.perPage, 10) || 20;
  var totalPages = Math.ceil(tweets.length / perPage) || 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  var start = (page - 1) * perPage;
  var pageTweets = tweets.slice(start, start + perPage);

  res.render('bo/index.ejs', {
    tweets: pageTweets,
    sortBy: sortBy,
    sortOrder: sortOrder,
    nextOrder: nextOrder,
    currentPage: page,
    totalPages: totalPages,
    totalTweets: totalTweets,
    perPage: perPage,
    title: 'Dashboard Tweets'
  });
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
