/* ─── CSE 62B · Analytics (Supabase) ─── */
const LU_ANALYTICS = (() => {
  const SUPA_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

  let _sid = sessionStorage.getItem('lu62b_sid');
  if (!_sid) {
    _sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('lu62b_sid', _sid);
  }

  const PAGE_MAP = {
    'cover-page': 'page_cover', 'classwork': 'page_classwork',
    'info':       'page_info',  'students':  'page_students',
    'resources':  'page_resources',
    'routine':    'page_routine',   'result':  'page_result',
    'gallery':    'page_gallery',   'login':   'page_login',
    'profile':    'page_profile',   'index':   'page_home',
  };
  const PAGE_DISPLAY = {
    'page_home': 'Home', 'page_cover': 'Cover Page', 'page_classwork': 'Classwork',
    'page_info': 'Info', 'page_students': 'Students', 'page_resources': 'Resources',
    'page_routine': 'Routine', 'page_result': 'Results',
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

  /* ── Presence (DB) ── */
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
    const r = await _req('/rest/v1/presence?select=session_id,page,user_name,updated_at&order=updated_at.desc');
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
      @media (max-width:768px) { #lu-online-badge { bottom:90px; right:20px; } }
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

  /* ═══════════════════════════════════════════════════
     ── Presence Toast — "X is online now" ──
     ═══════════════════════════════════════════════════ */

  const _AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#7c3aed,#a855f7)',
    'linear-gradient(135deg,#2563eb,#38bdf8)',
    'linear-gradient(135deg,#059669,#34d399)',
    'linear-gradient(135deg,#dc2626,#f87171)',
    'linear-gradient(135deg,#d97706,#fbbf24)',
    'linear-gradient(135deg,#db2777,#f472b6)',
    'linear-gradient(135deg,#7c3aed,#ec4899)',
    'linear-gradient(135deg,#0891b2,#22d3ee)',
  ];
  function _avatarGrad(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return _AVATAR_GRADIENTS[h % _AVATAR_GRADIENTS.length];
  }

  function _injectToastStyle() {
    if (document.getElementById('lu-toast-css')) return;
    const s = document.createElement('style');
    s.id = 'lu-toast-css';
    s.textContent = `
      #lu-toast-stack{
        position:fixed;bottom:58px;right:20px;z-index:9995;
        display:flex;flex-direction:column-reverse;gap:9px;
        pointer-events:none;
      }
      @media(max-width:768px){#lu-toast-stack{bottom:128px;right:14px;}}

      .lu-pt{
        position:relative;
        background:rgba(8,5,22,0.96);
        border:1px solid rgba(124,58,237,0.38);
        border-radius:18px;
        padding:13px 15px 15px 12px;
        display:flex;align-items:center;gap:11px;
        min-width:220px;max-width:268px;
        box-shadow:
          0 16px 48px rgba(0,0,0,0.65),
          0 0 0 1px rgba(124,58,237,0.12),
          inset 0 1px 0 rgba(255,255,255,0.06);
        backdrop-filter:blur(24px);
        -webkit-backdrop-filter:blur(24px);
        overflow:hidden;
        pointer-events:all;
        cursor:pointer;
        animation:luPtIn 0.55s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      .lu-pt.lu-pt-out{
        animation:luPtOut 0.36s cubic-bezier(0.55,0,1,0.45) forwards;
      }

      /* top shimmer line */
      .lu-pt::before{
        content:'';position:absolute;top:0;left:0;right:0;height:1px;
        background:linear-gradient(90deg,transparent 0%,rgba(167,139,250,0.55) 50%,transparent 100%);
        border-radius:18px 18px 0 0;
      }
      /* sweep shimmer */
      .lu-pt::after{
        content:'';position:absolute;top:0;left:-80%;width:50%;height:100%;
        background:linear-gradient(90deg,transparent,rgba(167,139,250,0.07),transparent);
        animation:luPtSweep 4s ease-in-out infinite 0.6s;
        pointer-events:none;
      }

      .lu-pt-avatar{
        width:42px;height:42px;border-radius:13px;
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;font-weight:800;color:#fff;
        font-family:'Space Grotesk','Inter',sans-serif;
        flex-shrink:0;position:relative;
        animation:luPtAvatarPop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
      }
      /* glow layer behind avatar */
      .lu-pt-avatar::before{
        content:'';position:absolute;inset:-4px;border-radius:16px;
        background:inherit;filter:blur(10px);opacity:0.45;z-index:-1;
      }

      .lu-pt-body{flex:1;min-width:0;}
      .lu-pt-name{
        font-weight:700;font-size:0.875rem;color:#ede9fe;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-family:'Space Grotesk','Inter',sans-serif;
        letter-spacing:0.01em;
        animation:luPtNameIn 0.4s ease 0.2s both;
      }
      .lu-pt-sub{
        font-size:0.7rem;color:rgba(167,139,250,0.6);
        display:flex;align-items:center;gap:5px;margin-top:3px;
        font-family:'Inter',sans-serif;
        animation:luPtNameIn 0.4s ease 0.3s both;
      }
      .lu-pt-dot{
        width:6px;height:6px;border-radius:50%;
        background:#22c55e;box-shadow:0 0 8px #22c55e;
        flex-shrink:0;animation:lu-pulse 1.5s ease-in-out infinite;
      }

      /* animated progress bar */
      .lu-pt-bar{
        position:absolute;bottom:0;left:0;
        height:2px;
        background:linear-gradient(90deg,#7c3aed,#a855f7,#ec4899);
        border-radius:0 0 0 18px;
        width:100%;
        animation:luPtBar var(--bar-dur,5s) linear forwards;
      }

      @keyframes luPtIn{
        0%  {transform:translateX(115%) scale(0.78);opacity:0;}
        65% {transform:translateX(-6px) scale(1.02);opacity:1;}
        100%{transform:translateX(0) scale(1);opacity:1;}
      }
      @keyframes luPtOut{
        0%  {transform:translateX(0) scale(1);opacity:1;}
        100%{transform:translateX(115%) scale(0.82);opacity:0;}
      }
      @keyframes luPtSweep{
        0%  {left:-80%;}
        40% {left:130%;}
        100%{left:130%;}
      }
      @keyframes luPtAvatarPop{
        0%  {transform:scale(0) rotate(-15deg);opacity:0;}
        70% {transform:scale(1.15) rotate(3deg);opacity:1;}
        100%{transform:scale(1) rotate(0deg);opacity:1;}
      }
      @keyframes luPtNameIn{
        from{transform:translateY(6px);opacity:0;}
        to  {transform:translateY(0);opacity:1;}
      }
      @keyframes luPtBar{
        from{width:100%;}
        to  {width:0%;}
      }
    `;
    document.head.appendChild(s);
  }

  const _DISMISS_DELAY = 5000;

  function showPresenceToast(name) {
    _injectToastStyle();
    let stack = document.getElementById('lu-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'lu-toast-stack';
      document.body.appendChild(stack);
    }

    const initial = name.trim().charAt(0).toUpperCase();
    const grad    = _avatarGrad(name);

    const toast = document.createElement('div');
    toast.className = 'lu-pt';
    toast.innerHTML = `
      <div class="lu-pt-avatar" style="background:${grad};">${initial}</div>
      <div class="lu-pt-body">
        <div class="lu-pt-name">${_escHtml(name.trim())}</div>
        <div class="lu-pt-sub">
          <span class="lu-pt-dot"></span>is online now
        </div>
      </div>
      <div class="lu-pt-bar" style="--bar-dur:${_DISMISS_DELAY}ms;"></div>
    `;

    const dismiss = () => {
      if (toast.classList.contains('lu-pt-out')) return;
      toast.classList.add('lu-pt-out');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, _DISMISS_DELAY);
    stack.appendChild(toast);
  }

  function _escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── New-arrival detection ── */
  let _presenceReady = false;

  function _seenSet() {
    try { return new Set(JSON.parse(sessionStorage.getItem('lu62b_seen_sids') || '[]')); }
    catch { return new Set(); }
  }
  function _saveSeen(set) {
    try { sessionStorage.setItem('lu62b_seen_sids', JSON.stringify([...set])); } catch {}
  }

  async function _checkNewArrivals() {
    try {
      const list = await getPresenceList();
      const seen = _seenSet();
      const me   = _user();

      if (!_presenceReady) {
        // First call: silently snapshot current presence, no toasts
        list.forEach(p => seen.add(p.session_id));
        _saveSeen(seen);
        _presenceReady = true;
        return;
      }

      const fresh = list.filter(p =>
        !seen.has(p.session_id) &&
        p.user_name &&
        p.session_id !== _sid &&
        (!me || p.user_name !== me.name)
      );

      list.forEach(p => seen.add(p.session_id));
      _saveSeen(seen);

      // Stagger multiple toasts so they don't all appear at once
      fresh.forEach((p, i) => setTimeout(() => showPresenceToast(p.user_name), i * 900));
    } catch { /* fail silently */ }
  }

  /* ═══════════════════════════════════════════════════
     ── Realtime WebSocket (instant presence notify) ──
     Uses Supabase Realtime Phoenix protocol directly,
     no SDK needed. Polling stays as a silent fallback.
     ═══════════════════════════════════════════════════ */
  function _initRealtimePresence() {
    const u = _user();
    if (!u?.name || u.isDemo || String(u.id || '').toUpperCase() === 'DEMO') return;

    const WS   = `wss://ftvtlqxpalwvyserujuh.supabase.co/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`;
    const CHAN  = 'realtime:lu62b-presence';

    let ws          = null;
    let ref         = 1;
    let joinRef     = null;
    let hbTimer     = null;
    let reconnTimer = null;
    let dead        = false; // set true on page unload

    function _send(obj) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    }

    function _join() {
      joinRef = String(ref++);
      _send({
        topic: CHAN, event: 'phx_join',
        payload: { config: { broadcast: { self: false } } },
        ref: joinRef, join_ref: joinRef,
      });
    }

    function _broadcastSelf() {
      const me = _user();
      if (!me?.name) return;
      _send({
        topic: CHAN, event: 'broadcast',
        payload: { type: 'broadcast', event: 'user_join', payload: { name: me.name, sid: _sid } },
        ref: String(ref++), join_ref: joinRef,
      });
    }

    function _connect() {
      if (dead) return;
      try {
        ws = new WebSocket(WS);

        ws.onopen = () => {
          _join();
          hbTimer = setInterval(() =>
            _send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref++) })
          , 25000);
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);

            // Channel joined — announce ourselves instantly
            if (msg.event === 'phx_reply' && msg.ref === joinRef && msg.payload?.status === 'ok') {
              _broadcastSelf();
              return;
            }

            // Someone else broadcasted their join
            if (msg.topic === CHAN && msg.event === 'broadcast') {
              const p = msg.payload?.payload;
              if (!p?.name || p.sid === _sid) return;
              const me = _user();
              if (me?.name && p.name === me.name) return;

              // Deduplicate with polling fallback via shared seen-set
              const seen = _seenSet();
              if (seen.has(p.sid)) return;
              seen.add(p.sid);
              _saveSeen(seen);

              showPresenceToast(p.name);
            }
          } catch { /* malformed message */ }
        };

        ws.onclose = () => {
          clearInterval(hbTimer);
          if (!dead) reconnTimer = setTimeout(_connect, 5000); // auto-reconnect
        };

        ws.onerror = () => ws.close();
      } catch { /* WebSocket not supported or blocked */ }
    }

    _connect();

    window.addEventListener('beforeunload', () => {
      dead = true;
      clearInterval(hbTimer);
      clearTimeout(reconnTimer);
      try { ws?.close(); } catch {}
    });
  }

  /* ── Public API ── */
  return {
    increment, getCounter, getOnlineCount, getPresenceList,
    pageKey: _pageKey, pageName: _pageName,
    showPresenceToast,

    async init() {
      try {
        await _cleanup();
        await Promise.all([increment('total_visits'), increment(_pageKey()), _upsertPresence()]);
        _createBadge();
        await _updateBadge();
        await _checkNewArrivals(); // snapshot current presence (no toast on first call)
        _initRealtimePresence();   // instant WebSocket channel
        setInterval(async () => {
          await _upsertPresence();
          await _updateBadge();
          await _checkNewArrivals(); // polling fallback — deduped via shared seen-set
        }, 30000);
        window.addEventListener('beforeunload', _deletePresence);
      } catch(e) { /* fail silently */ }
    },

    async trackPDF() {
      await Promise.all([increment('total_pdfs'), _upsertPresence('Generating PDF')]);
      setTimeout(() => _upsertPresence(), 8000);
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
