/* ── CSE 62B · Sheets API helper ────────────────────────────────────────────
   All Google Sheet / Drive / SMS calls are proxied through the Cloudflare
   Worker at api.lucse62.xyz so no secret IDs appear in client-side code.

   Offline support: every successful response is cached in localStorage.
   If a network request fails (offline), the last cached version is returned.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  var W = 'https://lucse62b-api.sy164425.workers.dev';

  function get(path) {
    var cacheKey = 'lu62b_sc_' + path;
    return fetch(W + path, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        try { localStorage.setItem(cacheKey, JSON.stringify({ d: data, t: Date.now() })); } catch (e) {}
        return data;
      })
      .catch(function (err) {
        try {
          var c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
          if (c && c.d) return c.d;
        } catch (e) {}
        throw err;
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

  /* Fetch any sheet by its ID (used for dynamic exam / routine tabs).
     raw=true → ask the Worker for &headers=0 so GVIZ doesn't fold a stacked
     multi-header sheet's first block (e.g. Batch 61) into the column labels. */
  window.fetchSheetById = function (id, tab, raw) {
    var q = '/fetch?id=' + encodeURIComponent(id);
    if (tab) q += '&sheet=' + encodeURIComponent(tab);
    if (raw) q += '&raw=1';
    return get(q);
  };

  /* Hidden column indices per tab → { "SATURDAY": [10], ... }.
     Lets the routine mirror columns the user hid in the Google Sheet. */
  window.fetchHiddenCols = function (id) {
    return get('/hidden-cols?id=' + encodeURIComponent(id));
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

  /* List images from subfolders (API key hidden in Worker) */
  window.fetchDriveGallery = function (folderId, limit) {
    var q = '/gallery?folder=' + encodeURIComponent(folderId);
    if (limit) q += '&limit=' + encodeURIComponent(limit);
    return get(q);
  };
})();
