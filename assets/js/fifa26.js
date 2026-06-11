/* ════════════════════════════════════════════════════════════════════
   FIFA WORLD CUP 2026 — TEMPORARY THEME + LIVE MATCH CENTER
   ⚽ Self-contained: injects its own CSS, banner, and modal.
   🗑️ To remove after the tournament:
      1. Delete this file + assets/css/fifa26.css
      2. Delete the FIFA26 loader line at the bottom of assets/js/theme.js
      3. (Optional) remove the /fifa route from worker/worker.js
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CONFIG ── */
  var ENABLED  = true;                      // master switch — false = theme off
  var WC_END   = '2026-07-21';              // auto-off 2 days after the final
  var WORKER   = 'https://lucse62b-api.sy164425.workers.dev';
  var TZ       = 'Asia/Dhaka';
  var WC_RANGE = '20260611-20260720';       // full tournament (UTC dates)

  if (!ENABLED) return;
  if (new Date() > new Date(WC_END + 'T23:59:59+06:00')) return;   // tournament over
  if (sessionStorage.getItem('f26_off') === '1') { applyThemeOnly(); return; }

  /* ── helpers ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function bdTime(iso) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
    } catch (e) { return ''; }
  }
  function bdDateKey(iso) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    } catch (e) { return ''; }
  }
  function bdDateLabel(iso) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
    } catch (e) { return ''; }
  }
  function todayKey() { return bdDateKey(new Date().toISOString()); }
  function roundLabel(slug) {
    if (!slug) return '';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* ── data fetch (with tiny localStorage cache) ── */
  function fetchMatches(dates, ttlMs) {
    var key = 'f26_c_' + dates;
    try {
      var c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < ttlMs) return Promise.resolve(c.m);
    } catch (e) {}
    return fetch(WORKER + '/fifa?dates=' + dates)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) {
        var m = d.matches || [];
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), m: m })); } catch (e) {}
        return m;
      });
  }
  /* UTC window covering BD "today" generously (yesterday→tomorrow UTC) */
  function todayWindow() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var a = new Date(d.getTime() - 864e5), b = new Date(d.getTime() + 864e5);
    var f = function (x) { return '' + x.getUTCFullYear() + p(x.getUTCMonth() + 1) + p(x.getUTCDate()); };
    return f(a) + '-' + f(b);
  }

  /* ── theme-only bits (also applied when banner dismissed) ── */
  function applyThemeOnly() {
    document.documentElement.setAttribute('data-fifa26', '1');
    if (!document.getElementById('fifa26-css')) {
      var l = document.createElement('link');
      l.id = 'fifa26-css'; l.rel = 'stylesheet'; l.href = '/assets/css/fifa26.css';
      document.head.appendChild(l);
    }
    if (!document.getElementById('fifa26-bg') && document.body) {
      var bg = document.createElement('div');
      bg.id = 'fifa26-bg';
      document.body.appendChild(bg);
    }
  }

  /* ── BANNER ── */
  var liveSeen = false;

  function tickItem(m) {
    var t = m.teams || [], a = t[0] || {}, b = t[1] || {};
    var mid;
    if (m.state === 'in') {
      mid = '<span class="f26-live-dot"></span><span class="f26-tick-score">' + esc(a.score) + '–' + esc(b.score) + '</span><span class="f26-tick-min">' + esc(m.clock) + '</span>';
      liveSeen = true;
    } else if (m.state === 'post') {
      mid = '<span class="f26-tick-score">' + esc(a.score) + '–' + esc(b.score) + '</span><span style="color:#94a3b8;font-size:.66rem;font-weight:800;">FT</span>';
    } else {
      mid = '<span class="f26-tick-time">' + esc(bdTime(m.date)) + '</span>';
    }
    return '<span class="f26-tick-item">'
      + (a.logo ? '<img src="' + esc(a.logo) + '" alt="">' : '') + esc(a.abbr || a.name)
      + mid
      + esc(b.abbr || b.name) + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '')
      + '</span>';
  }

  function nextMatchCountdownHTML(matches) {
    var now = Date.now();
    var next = matches.filter(function (m) { return m.state === 'pre' && new Date(m.date).getTime() > now; })
                      .sort(function (x, y) { return new Date(x.date) - new Date(y.date); })[0];
    if (!next) return '<span class="f26-tick-item">FIFA World Cup 2026 · United States · Canada · Mexico 🏆</span>';
    var t = next.teams || [], a = t[0] || {}, b = t[1] || {};
    return '<span class="f26-tick-item">Next: '
      + esc(a.name) + ' vs ' + esc(b.name)
      + ' <span class="f26-tick-time">' + esc(bdDateLabel(next.date)) + ', ' + esc(bdTime(next.date)) + '</span></span>';
  }

  function renderTicker(matches) {
    var el = document.getElementById('f26-track');
    if (!el) return;
    liveSeen = false;
    var tk = todayKey();
    var today = matches.filter(function (m) { return bdDateKey(m.date) === tk; });
    if (today.length) {
      var html = today.map(tickItem).join('<span style="color:rgba(251,191,36,.4);">•</span>');
      el.innerHTML = html + '<span style="color:rgba(251,191,36,.4);">•</span>' + html; /* loop seamlessly */
      el.classList.remove('f26-static');
      el.style.setProperty('--f26-speed', Math.max(22, today.length * 9) + 's');
    } else {
      el.innerHTML = nextMatchCountdownHTML(matches);
      el.classList.add('f26-static');
    }
  }

  function refreshBanner() {
    fetchMatches(todayWindow(), liveSeen ? 6e4 : 3e5).then(renderTicker).catch(function () {});
  }

  function buildBanner() {
    if (document.getElementById('fifa26-banner')) return;
    var b = document.createElement('div');
    b.id = 'fifa26-banner';
    b.innerHTML =
      '<span class="f26-ball">⚽</span>' +
      '<span class="f26-title"><b>WORLD CUP 26</b><small>USA · CAN · MEX</small></span>' +
      '<span class="f26-ticker"><span class="f26-track f26-static" id="f26-track">' +
        '<span class="f26-tick-item">Loading matches…</span></span></span>' +
      '<button class="f26-cta" id="f26-open"><i class="fa-solid fa-trophy"></i><span>&nbsp;Match Center</span></button>' +
      '<button class="f26-hide" id="f26-hide" title="Hide for this session">×</button>';
    document.body.insertBefore(b, document.body.firstChild);

    b.addEventListener('click', function () { openMC(); });
    document.getElementById('f26-open').addEventListener('click', function (e) { e.stopPropagation(); openMC(); });
    document.getElementById('f26-hide').addEventListener('click', function (e) {
      e.stopPropagation();
      sessionStorage.setItem('f26_off', '1');
      b.remove();
      var mc = document.getElementById('fifa26-mc'); if (mc) mc.remove();
      clearInterval(bannerTimer);
    });
  }

  /* ── MATCH CENTER ── */
  var mcTab = 'today', mcTimer = null, cdTimer = null;

  function statusBadge(m) {
    if (m.state === 'in')   return '<span class="f26-status live"><span class="f26-live-dot"></span>' + esc(m.clock || 'LIVE') + '</span>';
    if (m.state === 'post') return '<span class="f26-status ft">FT</span>';
    return '<span class="f26-status pre">' + esc(bdTime(m.date)) + '</span>';
  }

  function matchCard(m, withRound) {
    var t = m.teams || [], a = t[0] || {}, b = t[1] || {};
    var mid = (m.state === 'pre')
      ? '<span class="f26-vs-time">' + esc(bdTime(m.date)) + '</span>'
      : '<span class="f26-score">' + esc(a.score) + ' – ' + esc(b.score) + '</span>';
    var venue = (m.venue || m.city)
      ? '<span class="f26-venue">' + (withRound && m.round ? '<span class="f26-round-pill">' + esc(roundLabel(m.round)) + '</span> · ' : '')
        + '<i class="fa-solid fa-location-dot" style="opacity:.5;"></i> ' + esc(m.venue) + (m.city ? ', ' + esc(m.city) : '') + '</span>'
      : '';
    return '<div class="f26-match' + (m.state === 'in' ? ' f26-live' : '') + '">' +
      '<span class="f26-team' + (a.winner ? ' f26-win' : '') + '">' + (a.logo ? '<img src="' + esc(a.logo) + '" alt="">' : '') + '<b>' + esc(a.name) + '</b></span>' +
      '<span class="f26-mid">' + mid + statusBadge(m) + '</span>' +
      '<span class="f26-team away' + (b.winner ? ' f26-win' : '') + '"><b>' + esc(b.name) + '</b>' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '') + '</span>' +
      venue + '</div>';
  }

  function fmtCD(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000),
        d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
        m = Math.floor(s % 3600 / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d > 0 ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(ss);
  }

  function renderToday() {
    var body = document.getElementById('f26-mc-body');
    if (!body) return;
    fetchMatches(todayWindow(), 5e4).then(function (matches) {
      if (mcTab !== 'today') return;
      var tk = todayKey();
      var today = matches.filter(function (m) { return bdDateKey(m.date) === tk; })
                         .sort(function (x, y) { return new Date(x.date) - new Date(y.date); });
      var html = '';

      /* countdown to next kickoff */
      var now = Date.now();
      var next = matches.filter(function (m) { return m.state === 'pre' && new Date(m.date).getTime() > now; })
                        .sort(function (x, y) { return new Date(x.date) - new Date(y.date); })[0];
      if (next) {
        var nt = next.teams || [];
        html += '<div class="f26-cd"><span class="f26-cd-label"><i class="fa-regular fa-clock"></i> Next kickoff — ' +
          esc((nt[0] || {}).abbr || '') + ' vs ' + esc((nt[1] || {}).abbr || '') + '</span>' +
          '<span class="f26-cd-digits" id="f26-cd" data-at="' + new Date(next.date).getTime() + '">--:--:--</span></div>';
      }

      if (!today.length) {
        html += '<div class="f26-empty">No matches today (Bangladesh time) — check the full schedule ⚽</div>';
      } else {
        html += today.map(function (m) { return matchCard(m, true); }).join('');
      }
      body.innerHTML = html;
      startCD();
    }).catch(function () {
      if (mcTab === 'today') body.innerHTML = '<div class="f26-empty">Could not load matches — try again shortly.</div>';
    });
  }

  function startCD() {
    clearInterval(cdTimer);
    var el = document.getElementById('f26-cd');
    if (!el) return;
    var at = parseInt(el.dataset.at, 10);
    var step = function () {
      var el2 = document.getElementById('f26-cd');
      if (!el2) { clearInterval(cdTimer); return; }
      el2.textContent = fmtCD(at - Date.now());
    };
    step();
    cdTimer = setInterval(step, 1000);
  }

  function renderSchedule() {
    var body = document.getElementById('f26-mc-body');
    if (!body) return;
    body.innerHTML = '<div class="f26-loading"><i class="fa-solid fa-futbol"></i></div>';
    fetchMatches(WC_RANGE, 18e5).then(function (matches) {
      if (mcTab !== 'schedule') return;
      var sorted = matches.slice().sort(function (x, y) { return new Date(x.date) - new Date(y.date); });
      var tk = todayKey(), html = '', lastKey = '', anchorDone = false;
      sorted.forEach(function (m) {
        var k = bdDateKey(m.date);
        if (k !== lastKey) {
          lastKey = k;
          var isToday = k === tk;
          html += '<div class="f26-date-h"' + (isToday && !anchorDone ? ' id="f26-today-anchor"' : '') + '>' +
            (isToday ? '🔥 TODAY · ' : '') + esc(bdDateLabel(m.date)) + '</div>';
          if (isToday) anchorDone = true;
        }
        html += matchCard(m, true);
      });
      body.innerHTML = html || '<div class="f26-empty">Schedule unavailable.</div>';
      var anchor = document.getElementById('f26-today-anchor');
      if (anchor) anchor.scrollIntoView({ block: 'start' });
    }).catch(function () {
      if (mcTab === 'schedule') body.innerHTML = '<div class="f26-empty">Could not load schedule — try again shortly.</div>';
    });
  }

  function switchTab(tab) {
    mcTab = tab;
    var bt = document.getElementById('f26-tab-today'), bs = document.getElementById('f26-tab-sched');
    if (bt) bt.classList.toggle('on', tab === 'today');
    if (bs) bs.classList.toggle('on', tab === 'schedule');
    document.getElementById('f26-mc-body').innerHTML = '<div class="f26-loading"><i class="fa-solid fa-futbol"></i></div>';
    if (tab === 'today') renderToday(); else renderSchedule();
  }

  function buildMC() {
    if (document.getElementById('fifa26-mc')) return;
    var mc = document.createElement('div');
    mc.id = 'fifa26-mc';
    mc.innerHTML =
      '<div class="f26-mc-card">' +
        '<div class="f26-mc-head">' +
          '<img src="https://a.espncdn.com/i/leaguelogos/soccer/500-dark/4.png" alt="WC26">' +
          '<span class="f26-mc-head-t"><b>FIFA WORLD CUP 2026</b><small>MATCH CENTER · BANGLADESH TIME</small></span>' +
          '<button class="f26-mc-close" id="f26-mc-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="f26-tabs">' +
          '<button class="f26-tab on" id="f26-tab-today"><i class="fa-solid fa-bolt"></i> Today &amp; Live</button>' +
          '<button class="f26-tab" id="f26-tab-sched"><i class="fa-regular fa-calendar-days"></i> Full Schedule</button>' +
        '</div>' +
        '<div class="f26-mc-body" id="f26-mc-body"></div>' +
      '</div>';
    document.body.appendChild(mc);

    document.getElementById('f26-mc-close').addEventListener('click', closeMC);
    mc.addEventListener('click', function (e) { if (e.target === mc) closeMC(); });
    document.getElementById('f26-tab-today').addEventListener('click', function () { switchTab('today'); });
    document.getElementById('f26-tab-sched').addEventListener('click', function () { switchTab('schedule'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMC(); });
  }

  function openMC() {
    buildMC();
    var mc = document.getElementById('fifa26-mc');
    requestAnimationFrame(function () { mc.classList.add('active'); });
    document.body.style.overflow = 'hidden';
    switchTab(mcTab);
    clearInterval(mcTimer);
    mcTimer = setInterval(function () { if (mcTab === 'today') renderToday(); }, 6e4);
  }
  function closeMC() {
    var mc = document.getElementById('fifa26-mc');
    if (mc) mc.classList.remove('active');
    document.body.style.overflow = '';
    clearInterval(mcTimer); clearInterval(cdTimer);
  }

  /* ── boot ── */
  var bannerTimer = null;
  function boot() {
    applyThemeOnly();
    buildBanner();
    refreshBanner();
    bannerTimer = setInterval(refreshBanner, 9e4);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
