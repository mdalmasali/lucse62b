/* ═══════════════════════════════════════════════
   Portal Status · CSE 62B
   Reads "Website" tab → updates navbar badge.
   If status contains a maintenance keyword,
   shows a full-screen block page — except for
   student IDs listed in WHITELIST_IDS.
   ═══════════════════════════════════════════════ */

(async function () {
  const WORKER = 'https://lucse62b-api.sy164425.workers.dev';

  /* ── Keywords that trigger maintenance lock ── */
  const LOCK_KEYWORDS = ['maintenance', 'down', 'construction', 'offline', 'locked', 'unavailable'];

  /* ── Whitelisted student IDs (edit manually) ── */
  const WHITELIST_IDS = [
    '0182320012101068'
  ];

  /* ── Dot colors based on status text ── */
  const RED_KEYWORDS   = ['maintenance', 'down', 'offline', 'error', 'locked', 'unavailable'];
  const GREEN_KEYWORDS = ['active'];

  function dotColor(status) {
    const s = status.toLowerCase();
    if (GREEN_KEYWORDS.some(k => s.includes(k))) return { dot: '#22c55e', glow: '#22c55e' };
    if (RED_KEYWORDS.some(k => s.includes(k)))   return { dot: '#ef4444', glow: '#ef4444' };
    return { dot: '#f59e0b', glow: '#f59e0b' };
  }

  function isLocked(status) {
    const s = status.toLowerCase();
    return LOCK_KEYWORDS.some(k => s.includes(k));
  }

  function getLoggedInId() {
    try {
      const raw = sessionStorage.getItem('lu62b_student') || localStorage.getItem('lu62b_student');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return String(parsed.id || parsed.student_id || '').trim();
    } catch (_) { return null; }
  }

  /* ── Update navbar badge ── */
  function updateBadge(status) {
    const statusEl = document.querySelector('.topbar-status');
    const dotEl    = statusEl?.querySelector('.status-dot');
    if (!statusEl || !dotEl) return;
    const c = dotColor(status);
    dotEl.style.background = c.dot;
    dotEl.style.boxShadow  = `0 0 8px ${c.glow}`;
    [...statusEl.childNodes].forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });
    statusEl.appendChild(document.createTextNode(' ' + status));
  }

  /* ── Full-screen maintenance overlay ── */
  function showMaintenancePage(status, message) {
    const isRoot = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
    const loginHref = isRoot ? 'pages/login.html' : 'login.html';
    const style = document.createElement('style');
    style.textContent = `
      #ps-lock {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: #08040f;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        padding: 24px;
        overflow: hidden;
      }
      #ps-lock::before {
        content: '';
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 60% 50% at 20% 30%, rgba(124,58,237,0.18) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 80% 70%, rgba(6,182,212,0.10) 0%, transparent 60%);
        pointer-events: none;
      }
      .ps-lock-card {
        position: relative;
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 24px;
        padding: 52px 44px 44px;
        max-width: 520px; width: 100%;
        text-align: center;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.12);
        animation: psCardIn 0.5s cubic-bezier(0.34,1.2,0.64,1) forwards;
      }
      @keyframes psCardIn {
        from { opacity:0; transform: scale(0.92) translateY(20px); }
        to   { opacity:1; transform: scale(1) translateY(0); }
      }
      .ps-lock-icon {
        width: 68px; height: 68px; border-radius: 20px;
        background: rgba(124,58,237,0.15);
        border: 1px solid rgba(124,58,237,0.3);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 24px;
        font-size: 28px; color: #a78bfa;
      }
      .ps-lock-brand {
        font-size: 0.72rem; font-weight: 700; letter-spacing: 4px;
        color: rgba(167,139,250,0.5); text-transform: uppercase;
        margin-bottom: 8px;
      }
      .ps-lock-badge {
        display: inline-flex; align-items: center; gap: 7px;
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.3);
        color: #fca5a5; border-radius: 50px;
        padding: 5px 14px; font-size: 0.75rem; font-weight: 600;
        letter-spacing: 0.5px; margin-bottom: 28px;
      }
      .ps-lock-badge span.dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 8px #ef4444;
        display: inline-block; flex-shrink: 0;
        animation: psPulse 1.6s ease-in-out infinite;
      }
      @keyframes psPulse {
        0%,100% { opacity:1; } 50% { opacity:0.35; }
      }
      .ps-lock-title {
        font-size: 1.55rem; font-weight: 700; color: #f1f0ff;
        margin-bottom: 16px; line-height: 1.3;
      }
      .ps-lock-msg {
        font-size: 0.9rem; color: rgba(200,194,255,0.65);
        line-height: 1.75; margin-bottom: 20px;
      }
      .ps-lock-custom {
        background: rgba(124,58,237,0.08);
        border: 1px solid rgba(124,58,237,0.2);
        border-radius: 12px; padding: 14px 18px;
        font-size: 0.85rem; color: #c4b5fd;
        line-height: 1.6; margin-bottom: 28px;
      }
      .ps-lock-footer {
        font-size: 0.75rem; color: rgba(167,139,250,0.35);
        letter-spacing: 0.5px;
      }
      .ps-lock-login {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 20px;
        background: rgba(124,58,237,0.1);
        border: 1px solid rgba(124,58,237,0.25);
        color: rgba(167,139,250,0.6);
        padding: 8px 20px; border-radius: 50px;
        font-size: 0.78rem; font-weight: 500;
        text-decoration: none; cursor: pointer;
        transition: background 0.2s, color 0.2s;
      }
      .ps-lock-login:hover {
        background: rgba(124,58,237,0.2);
        color: #a78bfa;
      }
      @media (max-width: 540px) {
        .ps-lock-card { padding: 36px 22px 32px; border-radius: 18px; }
        .ps-lock-title { font-size: 1.25rem; }
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'ps-lock';
    overlay.innerHTML = `
      <div class="ps-lock-card">
        <div class="ps-lock-icon"><i class="fa-solid fa-screwdriver-wrench"></i></div>
        <div class="ps-lock-brand">CSE 62B · LEADING UNIVERSITY</div>
        <div class="ps-lock-badge"><span class="dot"></span>${escHtml(status)}</div>
        <div class="ps-lock-title">Portal Temporarily Unavailable</div>
        <p class="ps-lock-msg">We are currently performing updates and maintenance on the CSE 62B Portal. During this period, access to the portal has been temporarily suspended. We apologize for the inconvenience and appreciate your patience.</p>
        ${message ? `<div class="ps-lock-custom"><i class="fa-solid fa-circle-info" style="margin-right:7px;opacity:0.6;"></i>${escHtml(message)}</div>` : ''}
        <div class="ps-lock-footer">The portal will be restored shortly. &nbsp;—&nbsp; CSE 62B Team</div>
        <div>
          <button class="ps-lock-login" id="psStaffLoginBtn">
            <i class="fa-solid fa-right-to-bracket" style="font-size:0.72rem;"></i> Switch Account &amp; Login
          </button>
        </div>
      </div>
    `;
    document.documentElement.style.overflow = 'hidden';

    function attachBtn() {
      const btn = document.getElementById('psStaffLoginBtn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        sessionStorage.removeItem('lu62b_student');
        localStorage.removeItem('lu62b_student');
        window.location.href = loginHref;
      });
    }

    if (document.body) {
      document.body.appendChild(overlay);
      attachBtn();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(overlay);
        attachBtn();
      });
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Pages that are never locked (login must always be reachable) ── */
  const SKIP_LOCK_PAGES = ['login.html', 'password-setup.html'];
  function isLoginPage() {
    return SKIP_LOCK_PAGES.some(p => window.location.pathname.includes(p));
  }

  /* ── Main ── */
  try {
    const res = await fetch(`${WORKER}/sheet?name=Website`);
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.table?.rows || [];

    const kv = {};
    for (const row of rows) {
      const key = (row.c?.[0]?.v || '').trim();
      const val = (row.c?.[1]?.v || '').trim();
      if (key) kv[key] = val;
    }

    const status  = (kv['Portal Status'] || 'Active').trim();
    const message = (kv['Message'] || '').trim();

    updateBadge(status);

    if (isLocked(status) && !isLoginPage()) {
      const currentId = getLoggedInId();
      const allowed   = currentId && WHITELIST_IDS.includes(currentId);
      if (!allowed) showMaintenancePage(status, message);
    }

  } catch (_) {}
})();
