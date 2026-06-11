/* ── CSE 62B · Network background ──────────────────────────────────────────
   Interactive constellation: drifting nodes linked by lines, reacting to the
   cursor. Self-contained — injects its own full-screen canvas behind content
   and runs on every page (loaded from theme.js). Transparent, so the site's
   base background colour (dark or light theme) shows through.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__luNetBg) return;            // guard against double-load
  window.__luNetBg = true;

  /* Respect users who prefer reduced motion — skip the animation entirely */
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  function start() {
    if (document.getElementById('lu-net-bg')) return;

    var c = document.createElement('canvas');
    c.id = 'lu-net-bg';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    /* sits behind the .wrapper (z-index:1) but above the page background */
    (document.body || document.documentElement).appendChild(c);

    var x, W, H, N = [], LINK = 150;
    var mouse = { x: -9999, y: -9999, on: false };

    function fit() {
      var DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * DPR; c.height = H * DPR;
      x = c.getContext('2d');
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      /* node count scales with screen area — light on phones, fuller on desktop */
      var target = Math.round(Math.min(90, Math.max(26, (W * H) / 22000)));
      while (N.length < target) N.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 });
      while (N.length > target) N.pop();
    }
    fit();
    window.addEventListener('resize', fit);

    function setM(px, py) { mouse.x = px; mouse.y = py; mouse.on = true; }
    window.addEventListener('mousemove', function (e) { setM(e.clientX, e.clientY); });
    window.addEventListener('mouseout', function () { mouse.on = false; });
    window.addEventListener('touchmove', function (e) { if (e.touches[0]) setM(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchend', function () { mouse.on = false; });

    /* pause when tab is hidden to save battery/CPU */
    var running = true;
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(draw);
    });

    /* Palette adapts to the active theme — darker, denser ink on light mode so
       the nodes/lines stay visible against a bright background. */
    function palette() {
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      return light
        ? { line: '124,58,237', lineMax: 0.3, node: 'rgba(91,33,182,.85)', cursor: '2,132,199', cursorDot: 'rgba(2,132,199,.95)' }
        : { line: '124,58,237', lineMax: 0.18, node: 'rgba(167,139,250,.85)', cursor: '56,189,248', cursorDot: 'rgba(56,189,248,.9)' };
    }

    function draw() {
      if (!running) return;
      var P = palette();
      x.clearRect(0, 0, W, H);
      for (var i = 0; i < N.length; i++) {
        var a = N[i];
        if (mouse.on) {
          var mx = mouse.x - a.x, my = mouse.y - a.y, md = Math.hypot(mx, my);
          if (md < 200 && md > 0) { a.vx += mx / md * 0.015; a.vy += my / md * 0.015; }
        }
        a.vx *= 0.99; a.vy *= 0.99;
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;
        a.x = Math.max(0, Math.min(W, a.x)); a.y = Math.max(0, Math.min(H, a.y));

        for (var j = i + 1; j < N.length; j++) {
          var b = N[j], dx = a.x - b.x, dy = a.y - b.y, dd = Math.hypot(dx, dy);
          if (dd < LINK) {
            x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y);
            x.strokeStyle = 'rgba(' + P.line + ',' + (P.lineMax * (1 - dd / LINK)) + ')';
            x.lineWidth = 1; x.stroke();
          }
        }
        if (mouse.on) {
          var cd = Math.hypot(a.x - mouse.x, a.y - mouse.y);
          if (cd < 190) {
            x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(mouse.x, mouse.y);
            x.strokeStyle = 'rgba(' + P.cursor + ',' + (0.5 * (1 - cd / 190)) + ')';
            x.lineWidth = 1; x.stroke();
          }
        }
      }
      for (var k = 0; k < N.length; k++) {
        x.beginPath(); x.arc(N[k].x, N[k].y, 1.8, 0, 6.283);
        x.fillStyle = P.node; x.fill();
      }
      if (mouse.on) {
        x.beginPath(); x.arc(mouse.x, mouse.y, 3, 0, 6.283);
        x.fillStyle = P.cursorDot; x.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
