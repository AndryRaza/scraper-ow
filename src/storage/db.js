const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/tweets.json');

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    return { tweets: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Erreur lecture DB:', err.message);
    return { tweets: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erreur écriture DB:', err.message);
  }
}

/**
 * Ajoute les nouveaux tweets (évite les doublons par ID)
 */
function addTweets(tweets) {
  const db = readDb();
  const existingIds = new Set(db.tweets.map((t) => t.id));
  const newTweets = tweets.filter((t) => !existingIds.has(t.id));

  if (newTweets.length > 0) {
    db.tweets.push(...newTweets);
    db.tweets.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    writeDb(db);
  }

  return { added: newTweets.length, total: db.tweets.length };
}

/**
 * Récupère les tweets, optionnellement filtrés par compte
 */
function getTweets(account) {
  const db = readDb();
  if (account) {
    return db.tweets.filter(
      (t) => t.account.toLowerCase() === account.toLowerCase()
    );
  }
  return db.tweets;
}

module.exports = { addTweets, getTweets };
