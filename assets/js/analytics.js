/* ─── CSE 62B · Analytics (Supabase) ─── */
const SUPA_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

const LU_ANALYTICS = (() => {
  /* Session ID — unique per browser tab */
  let _sid = sessionStorage.getItem('lu62b_sid');
  if (!_sid) {
    _sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('lu62b_sid', _sid);
  }

  const PAGE_MAP = {
    'cover-page': 'page_cover', 'classwork': 'page_classwork',
    'info':       'page_info',  'students':  'page_students',
    'resources':  'page_resources', 'notices': 'page_notices',
    'routine':    'page_routine',   'result':  'page_result',
    'gallery':    'page_gallery',   'login':   'page_login',
    'profile':    'page_profile',   'index':   'page_home',
  };
  const PAGE_DISPLAY = {
    'page_home': 'Home', 'page_cover': 'Cover Page', 'page_classwork': 'Classwork',
    'page_info': 'Info', 'page_students': 'Students', 'page_resources': 'Resources',
    'page_notices': 'Notices', 'page_routine': 'Routine', 'page_result': 'Results',
    'page_gallery': 'Gallery', 'page_login': 'Login', 'page_profile': 'Profile',
  };

  function _pageKey() {
    const p = window.location.pathname;
    if (p === '/' || p.endsWith('/index.html') || p.endsWith('/Website/')) return 'page_home';
    for (const [k, v] of Object.entries(PAGE_MAP)) { if (p.includes(k)) return v; }
    return 'page_other';
  }
  function _pageName() { return PAGE_DISPLAY[_pageKey()] || 'Portal'; }
  function _user() {
    try {
      const r = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  }

  const _h = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
  };
  async function _req(path, opts = {}) {
    try {
      return await fetch(`${SUPA_URL}${path}`, { ...opts, headers: { ..._h, ...(opts.headers || {}) } });
    } catch { return null; }
  }

  /* ── Counters ── */
  async function increment(name) {
    await _req('/rest/v1/rpc/increment_counter', {
      method: 'POST', body: JSON.stringify({ counter_name: name }),
    });
  }
  async function getCounter(name) {
    const r = await _req(`/rest/v1/counters?name=eq.${encodeURIComponent(name)}&select=count`);
    if (!r || !r.ok) return 0;
    const d = await r.json();
    return Number(d[0]?.count) || 0;
  }

  /* ── Presence ── */
  async function _upsertPresence(pageName) {
    const u = _user();
    await _req('/rest/v1/presence', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        session_id: _sid, page: pageName || _pageName(),
        user_name: u?.name || null, user_id: u?.id || null,
        updated_at: new Date().toISOString(),
      }),
    });
  }
  async function _deletePresence() {
    await _req(`/rest/v1/presence?session_id=eq.${_sid}`, { method: 'DELETE' });
  }
  async function _cleanup() {
    await _req('/rest/v1/rpc/cleanup_old_presence', { method: 'POST', body: '{}' });
  }
  async function getOnlineCount() {
    const r = await _req('/rest/v1/presence?select=session_id', {
      headers: { 'Prefer': 'count=exact', 'Range': '0-0' },
    });
    if (!r) return 0;
    const cr = r.headers.get('content-range');
    if (cr) return parseInt(cr.split('/')[1]) || 0;
    const d = await r.json();
    return Array.isArray(d) ? d.length : 0;
  }
  async function getPresenceList() {
    const r = await _req('/rest/v1/presence?select=page,user_name,updated_at&order=updated_at.desc');
    if (!r || !r.ok) return [];
    return await r.json();
  }

  /* ── Online Badge ── */
  function _injectBadgeStyle() {
    if (document.getElementById('lu-badge-css')) return;
    const s = document.createElement('style');
    s.id = 'lu-badge-css';
    s.textContent = `
      #lu-online-badge{position:fixed;bottom:20px;right:20px;z-index:9990;
        background:rgba(10,10,25,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
        border:1px solid rgba(124,58,237,.28);border-radius:20px;padding:5px 13px;
        font-family:'Inter',sans-serif;font-size:.73rem;color:#c4b5fd;
        display:flex;align-items:center;gap:7px;
        box-shadow:0 4px 20px rgba(0,0,0,.35);user-select:none;
        transition:opacity .3s;cursor:default;}
      #lu-online-badge:hover{opacity:.7;}
      .lu-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;
        box-shadow:0 0 6px #22c55e;flex-shrink:0;
        animation:lu-pulse 2s ease-in-out infinite;}
      @keyframes lu-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(1.4);}}
    `;
    document.head.appendChild(s);
  }
  function _createBadge() {
    if (document.getElementById('lu-online-badge')) return;
    _injectBadgeStyle();
    const el = document.createElement('div');
    el.id = 'lu-online-badge';
    el.innerHTML = `<span class="lu-dot"></span><span id="lu-badge-num">…</span>&nbsp;online`;
    document.body.appendChild(el);
  }
  async function _updateBadge() {
    const el = document.getElementById('lu-badge-num');
    if (el) el.textContent = await getOnlineCount();
  }

  /* ── Public API ── */
  return {
    increment, getCounter, getOnlineCount, getPresenceList,
    pageKey: _pageKey, pageName: _pageName,

    async init() {
      try {
        await _cleanup();
        await Promise.all([increment('total_visits'), increment(_pageKey()), _upsertPresence()]);
        _createBadge();
        await _updateBadge();
        setInterval(async () => { await _upsertPresence(); await _updateBadge(); }, 60000);
        window.addEventListener('beforeunload', _deletePresence);
      } catch(e) { /* fail silently */ }
    },

    async trackPDF() {
      await Promise.all([increment('total_pdfs'), _upsertPresence('Generating PDF')]);
      setTimeout(() => _upsertPresence(), 8000); /* restore after generation */
    },
    async trackLogin()           { await increment('total_logins'); },
    async trackShare(platform)   { await increment(platform === 'whatsapp' ? 'total_shares_wa' : 'total_shares_tg'); },

    async getCoverStats() {
      const [totalPdfs, list] = await Promise.all([getCounter('total_pdfs'), getPresenceList()]);
      return { totalPdfs, generatingNow: list.filter(p => p.page === 'Generating PDF').length };
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => LU_ANALYTICS.init());
