/* ── CSE 62B · Sheets API helper ────────────────────────────────────────────
   All Google Sheet / Drive / SMS calls are proxied through the Cloudflare
   Worker at api.lucse62.xyz so no secret IDs appear in client-side code.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  var W = 'https://api.lucse62.xyz';

  function get(path) {
    return fetch(W + path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* Fetch a tab from the main student spreadsheet */
  window.fetchSheet = function (name) {
    return get('/sheet?name=' + encodeURIComponent(name));
  };

  /* Fetch a tab from the bot / classwork spreadsheet */
  window.fetchBotSheet = function (name) {
    return get('/sheet?name=' + encodeURIComponent(name) + '&type=bot');
  };

  /* Fetch any sheet by its ID (used for dynamic exam / routine tabs) */
  window.fetchSheetById = function (id, tab) {
    var q = '/fetch?id=' + encodeURIComponent(id);
    if (tab) q += '&sheet=' + encodeURIComponent(tab);
    return get(q);
  };

  /* Send SMS via gateway (credentials hidden in Worker) */
  window.sendProxySMS = function (phone, message) {
    return fetch(W + '/sms', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: phone, message: message }),
    });
  };

  /* List files in a Google Drive folder (API key hidden in Worker) */
  window.fetchDriveFolder = function (folderId) {
    return get('/drive?folder=' + encodeURIComponent(folderId));
  };
})();
