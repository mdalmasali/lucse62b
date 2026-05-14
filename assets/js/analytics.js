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
  async function getPresenceList() {
    const r = await _req('/rest/v1/presence?select=session_id,page,user_name,user_id,updated_at&order=updated_at.desc');
    if (!r || !r.ok) return [];
    return await r.json();
  }

  /* Deduplicate by user_id — multi-tab users count once */
  function _dedupeList(list) {
    const byUser = new Map();
    const anon   = [];
    list.forEach(p => {
      if (p.user_id) {
        if (!byUser.has(p.user_id)) byUser.set(p.user_id, p);
      } else {
        anon.push(p);
      }
    });
    return { users: [...byUser.values()], anon };
  }

  function getOnlineCount(list) {
    if (!list) return 0;
    const { users } = _dedupeList(list);
    return users.length; // only count logged-in users
  }

  /* Shared cache — one fetch per interval serves badge + arrivals */
  let _lastList = [];

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
        transition:opacity .3s;cursor:pointer;}
      #lu-online-badge:hover{opacity:.85;}
      #lu-online-badge.lu-badge-open{border-color:rgba(124,58,237,.6);box-shadow:0 4px 24px rgba(124,58,237,.25);}
      @media (max-width:768px) { #lu-online-badge { bottom:90px; right:20px; } }
      .lu-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;
        box-shadow:0 0 6px #22c55e;flex-shrink:0;
        animation:lu-pulse 2s ease-in-out infinite;}
      @keyframes lu-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(1.4);}}

      /* ── Who's Online Panel ── */
      #lu-who-panel{
        position:fixed;bottom:54px;right:20px;z-index:9991;
        background:rgba(8,5,22,0.97);border:1px solid rgba(124,58,237,0.35);
        border-radius:18px;padding:14px 0 10px;min-width:230px;max-width:280px;
        box-shadow:0 16px 48px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
        transform-origin:bottom right;
        animation:luPanelIn .22s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      #lu-who-panel.lu-panel-out{animation:luPanelOut .16s ease-in forwards;}
      @media(max-width:768px){#lu-who-panel{bottom:124px;right:14px;}}
      .lu-panel-title{
        font-size:.68rem;font-weight:700;color:rgba(167,139,250,.5);
        letter-spacing:.1em;text-transform:uppercase;
        padding:0 16px 10px;border-bottom:1px solid rgba(124,58,237,.12);
        font-family:'Inter',sans-serif;
      }
      .lu-panel-list{max-height:260px;overflow-y:auto;padding:6px 0;}
      .lu-panel-row{
        display:flex;align-items:center;gap:10px;padding:7px 14px;
        transition:background .15s;cursor:default;
      }
      .lu-panel-row:hover{background:rgba(124,58,237,.06);}
      .lu-panel-av{
        width:32px;height:32px;border-radius:10px;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
        font-size:.85rem;font-weight:800;color:#fff;
        font-family:'Space Grotesk','Inter',sans-serif;
        position:relative;
      }
      .lu-panel-av::before{
        content:'';position:absolute;inset:-3px;border-radius:12px;
        background:inherit;filter:blur(7px);opacity:.35;z-index:-1;
      }
      .lu-panel-info{flex:1;min-width:0;}
      .lu-panel-name{
        font-size:.82rem;font-weight:600;color:#ede9fe;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-family:'Space Grotesk','Inter',sans-serif;
      }
      .lu-panel-page{font-size:.67rem;color:rgba(167,139,250,.5);font-family:'Inter',sans-serif;}
      .lu-panel-you{
        font-size:.6rem;font-weight:700;color:#7c3aed;
        background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.25);
        border-radius:6px;padding:1px 6px;flex-shrink:0;
      }
      .lu-panel-anon{
        padding:7px 14px;font-size:.73rem;color:rgba(167,139,250,.4);
        font-family:'Inter',sans-serif;
      }
      .lu-panel-empty{
        padding:18px 14px;text-align:center;font-size:.78rem;
        color:rgba(167,139,250,.4);font-family:'Inter',sans-serif;
      }
      @keyframes luPanelIn{
        from{transform:scale(.88) translateY(8px);opacity:0;}
        to  {transform:scale(1) translateY(0);opacity:1;}
      }
      @keyframes luPanelOut{
        from{transform:scale(1) translateY(0);opacity:1;}
        to  {transform:scale(.88) translateY(8px);opacity:0;}
      }
    `;
    document.head.appendChild(s);
  }

  function _closePanel() {
    const p = document.getElementById('lu-who-panel');
    if (!p) return;
    p.classList.add('lu-panel-out');
    p.addEventListener('animationend', () => p.remove(), { once: true });
    document.getElementById('lu-online-badge')?.classList.remove('lu-badge-open');
  }

  function _openPanel(list) {
    if (document.getElementById('lu-who-panel')) { _closePanel(); return; }

    const me = _user();
    const { users, anon } = _dedupeList(list);
    const badge = document.getElementById('lu-online-badge');
    badge?.classList.add('lu-badge-open');

    const panel = document.createElement('div');
    panel.id = 'lu-who-panel';

    let rows = '';
    users.forEach(p => {
      const isMe = me && p.user_id === me.id;
      const initial = (p.user_name || '?').charAt(0).toUpperCase();
      const grad = _avatarGrad(p.user_name || '?');
      rows += `
        <div class="lu-panel-row">
          <div class="lu-panel-av" style="background:${grad}">${_escHtml(initial)}</div>
          <div class="lu-panel-info">
            <div class="lu-panel-name">${_escHtml(p.user_name || 'Unknown')}</div>
            <div class="lu-panel-page">${_escHtml(p.page || 'Portal')}</div>
          </div>
          ${isMe ? '<span class="lu-panel-you">You</span>' : ''}
        </div>`;
    });

    if (!users.length) {
      rows = '<div class="lu-panel-empty">No one else is online</div>';
    }

    panel.innerHTML = `
      <div class="lu-panel-title">Online Now · ${getOnlineCount(list)}</div>
      <div class="lu-panel-list">${rows}</div>`;

    document.body.appendChild(panel);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!panel.contains(e.target) && e.target.id !== 'lu-online-badge') {
          _closePanel();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }

  function _createBadge() {
    if (document.getElementById('lu-online-badge')) return;
    _injectBadgeStyle();
    const el = document.createElement('div');
    el.id = 'lu-online-badge';
    el.innerHTML = `<span class="lu-dot"></span><span id="lu-badge-num">…</span>&nbsp;online`;
    el.addEventListener('click', () => _openPanel(_lastList));
    document.body.appendChild(el);
  }

  function _updateBadgeFromList(list) {
    _lastList = list;
    const el = document.getElementById('lu-badge-num');
    if (el) el.textContent = getOnlineCount(list);
    // Refresh panel if open
    const panel = document.getElementById('lu-who-panel');
    if (panel) { _closePanel(); setTimeout(() => _openPanel(list), 220); }
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

  async function _checkNewArrivals(list) {
    try {
      if (!list) list = await getPresenceList();
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
        (!me || p.user_id !== me.id)
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
        // Single fetch: serves badge count + arrival snapshot
        const initialList = await getPresenceList();
        _updateBadgeFromList(initialList);
        await _checkNewArrivals(initialList); // snapshot silently (no toasts)
        _initRealtimePresence();              // instant WebSocket joins
        setInterval(async () => {
          if (document.hidden) return; // don't poll while tab is not visible
          await _upsertPresence();
          const list = await getPresenceList();
          _updateBadgeFromList(list);
          await _checkNewArrivals(list);
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
