/* ═══════════════════════════════════════════════
   Event Poster  ·  CSE 62B Portal
   Set POSTER_IMAGE to any image path to show it
   as a popup overlay on every page (once per session).
   Set to '' or null to disable.
   ═══════════════════════════════════════════════ */

/*const POSTER_IMAGE = '/assets/images/Eid Poster.jpg';*/

if (POSTER_IMAGE) {
  /* ── Inject CSS ── */
  const style = document.createElement('style');
  style.textContent = `
    .ep-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      background: rgba(0,0,0,0.82);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      animation: epFadeIn 0.35s ease forwards;
      padding: 20px;
    }
    @keyframes epFadeIn { from { opacity:0; } to { opacity:1; } }

    .ep-img {
      width: min(520px, 92vw);
      height: auto;
      border-radius: 16px;
      box-shadow: 0 12px 60px rgba(0,0,0,0.7);
      display: block;
      user-select: none;
      -webkit-user-drag: none;
      animation: epPop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;
    }
    @keyframes epPop {
      from { transform: scale(0.84) translateY(20px); opacity:0; }
      to   { transform: scale(1)    translateY(0);    opacity:1; }
    }

    .ep-dismiss {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.22);
      color: #fff;
      padding: 10px 28px;
      border-radius: 50px;
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.5px;
      transition: background 0.2s, transform 0.2s;
    }
    .ep-dismiss:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }

    .ep-timer {
      width: 80px; height: 2px;
      background: rgba(255,255,255,0.12);
      border-radius: 100px; overflow: hidden;
    }
    .ep-timer-fill {
      height: 100%; width: 100%;
      background: rgba(255,255,255,0.5);
      border-radius: 100px;
      animation: epDrain 6s linear forwards;
    }
    @keyframes epDrain { from { width:100%; } to { width:0%; } }
  `;
  document.head.appendChild(style);

  const SESSION_KEY = 'ep_shown_' + POSTER_IMAGE;

  function showPoster() {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    const overlay = document.createElement('div');
    overlay.className = 'ep-overlay';
    overlay.id = 'epOverlay';
    overlay.innerHTML = `
      <img src="${POSTER_IMAGE}" class="ep-img" alt="Event Poster" draggable="false">
      <button class="ep-dismiss" onclick="document.getElementById('epOverlay').remove()">Dismiss &nbsp; ✕</button>
      <div class="ep-timer"><div class="ep-timer-fill"></div></div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    setTimeout(() => {
      const el = document.getElementById('epOverlay');
      if (el) { el.style.animation = 'epFadeIn 0.3s ease reverse forwards'; setTimeout(() => el.remove(), 300); }
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showPoster);
  } else {
    showPoster();
  }
}
