const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '../../cookies/twitter-cookies.json');

function loadCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  } catch (err) {
    return null;
  }
}

function saveCookies(cookies) {
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

module.exports = {
  loadCookies,
  saveCookies,
  COOKIES_PATH,
};
