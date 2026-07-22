var cancelled = false;

function reset() {
  cancelled = false;
}

function cancel() {
  cancelled = true;
}

function check() {
  return cancelled;
}

/** Lance une erreur si annulé */
function throwIfCancelled(message) {
  if (cancelled) {
    var err = new Error(message || 'Scraping annulé par l\'utilisateur.');
    err.name = 'CancelError';
    throw err;
  }
}

module.exports = { reset, cancel, check, throwIfCancelled };
