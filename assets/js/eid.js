/* ════════════════════════════════════════════════════════════
   Eid ul-Adha Theme  ·  CSE 62B Portal
   Set EID_MODE = true to activate the full Eid experience.
   Set EID_MODE = false to revert to the normal site instantly.
   ════════════════════════════════════════════════════════════ */

const EID_MODE = false;

if (EID_MODE) {
  /* ── Inject fonts + CSS ── */
  (function () {
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Amiri:wght@400;700&family=Dancing+Script:wght@700&family=Noto+Serif+Bengali:wght@700&display=swap';
    document.head.appendChild(fonts);

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/css/eid.css';
    document.head.appendChild(css);
  })();

  /* ── Activate theme class ── */
  document.documentElement.classList.add('eid-active');

  /* ── Eid Banner (injected just after <body> opens, before .wrapper) ── */
  function injectBanner() {
    const banner = document.createElement('div');
    banner.className = 'eid-banner';
    banner.id = 'eidBanner';
    banner.innerHTML = `
      <div class="eid-banner-inner">
        <div class="eid-banner-text">🌙 ঈদ মোবারক — Eid ul-Adha 2026 🐄</div>
        <div class="eid-banner-arabic">عيد الأضحى مبارك · تقبل الله منا ومنكم</div>
      </div>`;
    document.body.insertAdjacentElement('afterbegin', banner);
  }


  /* ── Floating Particles ── */
  const PARTICLES = ['✦', '✦', '✦', '☽', '✦', '✦', '🌙', '✦', '✦', '✦'];
  function injectParticles() {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'eid-particle';
      p.textContent = PARTICLES[i % PARTICLES.length];
      const size = (Math.random() * 10 + 8).toFixed(1);
      const left = (Math.random() * 96 + 2).toFixed(1);
      const dur  = (Math.random() * 14 + 10).toFixed(1);
      const delay = (Math.random() * 12).toFixed(1);
      p.style.cssText = `
        font-size:${size}px;
        left:${left}%;
        animation-duration:${dur}s;
        animation-delay:-${delay}s;
        color: ${Math.random() > 0.5 ? 'rgba(212,175,55,0.7)' : 'rgba(74,222,128,0.5)'};
      `;
      document.body.appendChild(p);
    }
  }

  /* ── Overlay ── */
  const OVERLAY_KEY = 'eid2026_overlay_shown';

  function buildOverlay() {
    if (sessionStorage.getItem(OVERLAY_KEY)) return;
    sessionStorage.setItem(OVERLAY_KEY, '1');

    const overlay = document.createElement('div');
    overlay.className = 'eid-overlay';
    overlay.id = 'eidOverlay';
    overlay.innerHTML = `
      <div class="eid-overlay-card">
        <!-- corner ornaments -->
        <div class="eid-orn tl"></div>
        <div class="eid-orn tr"></div>
        <div class="eid-orn bl"></div>
        <div class="eid-orn br"></div>

        <!-- floating clouds -->
        <span class="eid-cloud eid-cloud-tl">☁️</span>
        <span class="eid-cloud eid-cloud-tr">☁️</span>
        <span class="eid-cloud eid-cloud-bl">☁️</span>

        <!-- scene: lantern + crescent+goat + lantern -->
        <div class="eid-scene">
          <span class="eid-lantern eid-lantern-l">🏮</span>
          <div class="eid-crescent-wrap">
            <span class="eid-scene-moon">🌙</span>
            <span class="eid-scene-goat">🐐</span>
            <span class="eid-scene-cloud cl1">☁️</span>
            <span class="eid-scene-cloud cl2">☁️</span>
            <div class="eid-scene-sparkles">✦ &nbsp; ✦ &nbsp; ✦</div>
          </div>
          <span class="eid-lantern eid-lantern-r">🏮</span>
        </div>

        <!-- text block -->
        <div class="eid-text-block">
          <div class="eid-arabic-sm">عيد الأضحى مبارك</div>
          <div class="eid-eid-script">Eid</div>
          <div class="eid-aladha-bold">Al Adha</div>
          <div class="eid-spaced-mubarak">M U B A R A K</div>
        </div>

        <div class="eid-line"><span></span><em>◆</em><span></span></div>
        <div class="eid-section">CSE Batch 62 &nbsp;·&nbsp; Section B &nbsp;·&nbsp; Leading University</div>

        <button class="eid-dismiss-btn" onclick="document.getElementById('eidOverlay').remove()">
          ঈদ মোবারক &nbsp; 🌙
        </button>
        <div class="eid-timer"><div class="eid-timer-fill"></div></div>
      </div>`;

    document.body.appendChild(overlay);

    /* close on backdrop click */
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    /* auto-dismiss after 6 s */
    setTimeout(() => {
      if (document.getElementById('eidOverlay')) {
        overlay.style.animation = 'eidOverlayFadeIn 0.4s ease reverse forwards';
        setTimeout(() => overlay.remove(), 400);
      }
    }, 6000);
  }

  /* ── Init ── */
  function initEid() {
    injectBanner();
    injectParticles();
    buildOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEid);
  } else {
    initEid();
  }
}
