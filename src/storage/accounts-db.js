var fs = require('fs');
var path = require('path');
var fallbackAccounts = require('../config/accounts');

var DB_PATH = path.join(__dirname, '../../data/accounts.json');

function toObject(entry) {
  if (typeof entry === 'string') {
    return { handle: entry, enabled: true };
  }
  return { handle: entry.handle || '', enabled: entry.enabled !== false };
}

function read() {
  if (!fs.existsSync(DB_PATH)) {
    return fallbackAccounts.slice().map(toObject);
  }
  try {
    var raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) {
      return fallbackAccounts.slice().map(toObject);
    }
    return raw.map(toObject);
  } catch (e) {
    return fallbackAccounts.slice().map(toObject);
  }
}

function write(accounts) {
  fs.writeFileSync(DB_PATH, JSON.stringify(accounts, null, 2));
}

function list() {
  return read();
}

function add(account) {
  var accounts = read();
  var handle = account.replace(/^@/, '').trim();
  if (!handle) return { added: false, error: 'Handle vide' };
  if (accounts.some(function (a) { return a.handle.toLowerCase() === handle.toLowerCase(); })) {
    return { added: false, error: 'Ce compte existe déjà' };
  }
  accounts.push({ handle: handle, enabled: true });
  write(accounts);
  return { added: true, accounts: accounts };
}

function remove(account) {
  var accounts = read();
  var handle = account.replace(/^@/, '').trim();
  var filtered = accounts.filter(function (a) { return a.handle.toLowerCase() !== handle.toLowerCase(); });
  if (filtered.length === accounts.length) {
    return { removed: false, error: 'Compte introuvable' };
  }
  write(filtered);
  return { removed: true, accounts: filtered };
}

function update(account, changes) {
  var accounts = read();
  var handle = account.replace(/^@/, '').trim();
  var found = false;
  accounts.forEach(function (a) {
    if (a.handle.toLowerCase() === handle.toLowerCase()) {
      if (changes.enabled !== undefined) a.enabled = changes.enabled;
      found = true;
    }
  });
  if (!found) return { updated: false, error: 'Compte introuvable' };
  write(accounts);
  return { updated: true, accounts: accounts };
}

module.exports = { list: list, add: add, remove: remove, update: update };
