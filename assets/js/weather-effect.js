/* ═══════════════════════════════════════════════
   Weather Effect · CSE 62B Portal
   Real-time weather based on user's location
   + navbar temperature widget
   ═══════════════════════════════════════════════ */

(function () {
  const FALLBACK_LAT = 24.8949, FALLBACK_LON = 91.8687;
  const CACHE_TTL = 10 * 60 * 1000;

  function buildAPI(lat, lon) {
    return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,precipitation,wind_speed_10m,temperature_2m,apparent_temperature,relative_humidity_2m,is_day&timezone=auto`;
  }

  function cacheKey(lat, lon) {
    return `wx_${lat.toFixed(1)}_${lon.toFixed(1)}_v4`;
  }

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON, fallback: true }); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, fallback: false }),
        ()    => resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON, fallback: true }),
        { timeout: 5000, maximumAge: 0 }
      );
    });
  }

  async function getCityName(lat, lon) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return 'Sylhet';
      const d = await res.json();
      const a = d.address || {};
      return a.city || a.town || a.village || a.county || 'Sylhet';
    } catch (_) { return 'Sylhet'; }
  }

  /* ── WMO code → effect ───────────────────────── */
  function codeToEffect(code, precip, temp, isDay) {
    if (code === 0 || code <= 3) {
      if (!isDay)      return 'stars';
      if (temp >= 38)  return 'heat';
      return 'none';
    }
    if (code === 45 || code === 48)               return 'fog';
    if (code >= 51 && code <= 57)                 return 'drizzle';
    if (code === 61 || code === 80)               return 'rain-light';
    if (code === 63 || code === 81)               return 'rain-medium';
    if (code === 65 || code === 82)               return 'rain-heavy';
    if (code === 95 || code === 96 || code === 99) return 'storm';
    if (code >= 71 && code <= 77)                 return 'snow';
    if (code === 85 || code === 86)               return 'snow';
    if (precip > 3)                               return 'rain-heavy';
    if (precip > 0.5)                             return 'rain-medium';
    return 'none';
  }

  function codeToMeta(code, isDay) {
    const night = !isDay;
    if (code === 0) return night
      ? { icon: 'fa-moon',       label: 'Clear Night' }
      : { icon: 'fa-sun',        label: 'Clear Sky' };
    if (code <= 3) return night
      ? { icon: 'fa-cloud-moon', label: 'Partly Cloudy' }
      : { icon: 'fa-cloud-sun',  label: 'Partly Cloudy' };
    if (code <= 48)  return { icon: 'fa-smog',                  label: 'Foggy' };
    if (code <= 57)  return { icon: 'fa-cloud-drizzle',         label: 'Drizzle' };
    if (code <= 67)  return { icon: 'fa-cloud-rain',            label: 'Rain' };
    if (code <= 77)  return { icon: 'fa-snowflake',             label: 'Snow' };
    if (code <= 82)  return { icon: 'fa-cloud-showers-heavy',   label: 'Rain Showers' };
    if (code <= 86)  return { icon: 'fa-snowflake',             label: 'Snow Showers' };
    return { icon: 'fa-cloud-bolt', label: 'Thunderstorm' };
  }

  function tempAccent(temp) {
    if (temp >= 38) return { border: 'rgba(251,146,60,0.45)', icon: '#fb923c' };
    if (temp <= 10) return { border: 'rgba(96,165,250,0.45)',  icon: '#60a5fa' };
    return { border: 'rgba(255,255,255,0.11)', icon: 'var(--accent-bright,#a78bfa)' };
  }

  /* ── Navbar weather chip ─────────────────────── */
  function injectNavWidget(temp, code, city, feelsLike, humidity, wind, isDay) {
    const meta     = codeToMeta(code, isDay);
    const cityName = city || 'Sylhet';
    const acc      = tempAccent(temp);
    const statusEl = document.querySelector('.topbar-status');
    if (!statusEl || document.getElementById('wx-nav-chip')) return;

    const style = document.createElement('style');
    style.textContent = `
      .wx-nav-chip {
        display: flex; align-items: center; gap: 7px;
        font-family: 'Inter', sans-serif;
        padding: 5px 13px 5px 11px; border-radius: 50px;
        background: rgba(255,255,255,0.06);
        border: 1px solid ${acc.border};
        white-space: nowrap; cursor: default;
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        transition: background 0.2s;
      }
      .wx-nav-chip:hover { background: rgba(255,255,255,0.10); }
      .wx-nav-chip > i { font-size: 0.82rem; color: ${acc.icon}; opacity: 0.9; }
      .wx-chip-temp { font-size: 0.82rem; font-weight: 700; color: var(--text-primary,#f1f0ff); letter-spacing: 0.2px; }
      .wx-chip-sep  { font-size: 0.6rem; opacity: 0.3; color: var(--text-secondary,#888); }
      .wx-chip-city { font-size: 0.72rem; font-weight: 500; color: var(--text-secondary,#aaa); opacity: 0.8; }

      #wx-tooltip-popup {
        position: fixed; z-index: 999999; pointer-events: none;
        background: rgba(10,6,22,0.93);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 13px; padding: 11px 15px;
        min-width: 175px; font-size: 0.74rem; font-family: 'Inter', sans-serif;
        color: rgba(200,194,255,0.75);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        line-height: 2; white-space: nowrap;
        opacity: 0; transition: opacity 0.18s;
        transform: translateX(-50%);
      }
      #wx-tooltip-popup.wx-tt-visible { opacity: 1; }
      .wx-tooltip-row { display: flex; justify-content: space-between; gap: 18px; }
      .wx-tooltip-val { color: #f1f0ff; font-weight: 600; }

      html[data-theme="light"] .wx-nav-chip { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.10); }
      html[data-theme="light"] .wx-chip-temp { color: #1a1a2e; }
      html[data-theme="light"] .wx-chip-city { color: #555; }
      html[data-theme="light"] .wx-nav-chip > i { color: ${acc.icon === 'var(--accent-bright,#a78bfa)' ? '#7c3aed' : acc.icon}; }
      html[data-theme="light"] #wx-tooltip-popup { background: rgba(245,243,255,0.97); border-color: rgba(0,0,0,0.09); color: #555; }
      html[data-theme="light"] .wx-tooltip-val { color: #1a1a2e; }
      @media (max-width: 768px) { .wx-nav-chip { display: none; } }
    `;
    document.head.appendChild(style);

    const fl = feelsLike != null ? `${Math.round(feelsLike)}°C` : '—';
    const hu = humidity  != null ? `${humidity}%`               : '—';
    const wi = wind      != null ? `${Math.round(wind)} km/h`   : '—';

    const chip = document.createElement('div');
    chip.className = 'wx-nav-chip';
    chip.id        = 'wx-nav-chip';
    chip.innerHTML = `
      <i class="fa-solid ${meta.icon}"></i>
      <span class="wx-chip-temp">${Math.round(temp)}°C</span>
      <span class="wx-chip-sep">|</span>
      <span class="wx-chip-city">${cityName}</span>`;
    statusEl.parentElement.insertBefore(chip, statusEl);

    /* Tooltip — appended to body so navbar overflow:hidden can't clip it */
    const tt = document.createElement('div');
    tt.id = 'wx-tooltip-popup';
    tt.innerHTML = `
      <div class="wx-tooltip-row"><span>Feels like</span><span class="wx-tooltip-val">${fl}</span></div>
      <div class="wx-tooltip-row"><span>Humidity</span><span class="wx-tooltip-val">${hu}</span></div>
      <div class="wx-tooltip-row"><span>Wind</span><span class="wx-tooltip-val">${wi}</span></div>`;
    document.body.appendChild(tt);

    chip.addEventListener('mouseenter', () => {
      const r = chip.getBoundingClientRect();
      tt.style.top  = (r.bottom + 8) + 'px';
      tt.style.left = (r.left + r.width / 2) + 'px';
      tt.classList.add('wx-tt-visible');
    });
    chip.addEventListener('mouseleave', () => tt.classList.remove('wx-tt-visible'));
  }

  /* ── Canvas setup ────────────────────────────── */
  function createCanvas() {
    const c = document.createElement('canvas');
    c.id = 'wx-canvas';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9980;';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    function resize() { c.width = window.innerWidth; c.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    return { canvas: c, ctx };
  }

  /* ── Rain drops ──────────────────────────────── */
  const DROP_PROFILE = {
    drizzle:       { lenMin: 4,  lenR: 5,  speedMin: 4,  speedR: 3,  opMin: 0.06, opR: 0.10, wMin: 0.2, wR: 0.3  },
    'rain-light':  { lenMin: 8,  lenR: 8,  speedMin: 7,  speedR: 4,  opMin: 0.10, opR: 0.14, wMin: 0.3, wR: 0.3  },
    'rain-medium': { lenMin: 12, lenR: 10, speedMin: 11, speedR: 5,  opMin: 0.14, opR: 0.16, wMin: 0.4, wR: 0.35 },
    'rain-heavy':  { lenMin: 16, lenR: 12, speedMin: 15, speedR: 6,  opMin: 0.18, opR: 0.16, wMin: 0.5, wR: 0.4  },
    storm:         { lenMin: 18, lenR: 14, speedMin: 18, speedR: 7,  opMin: 0.20, opR: 0.18, wMin: 0.55,wR: 0.45 },
  };

  function makeDrops(n, canvas, effect) {
    const p = DROP_PROFILE[effect] || DROP_PROFILE['rain-medium'];
    return Array.from({ length: n }, () => ({
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      len:     p.lenMin   + Math.random() * p.lenR,
      speed:   p.speedMin + Math.random() * p.speedR,
      opacity: p.opMin    + Math.random() * p.opR,
      width:   p.wMin     + Math.random() * p.wR,
    }));
  }

  function rainColor(opacity) {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    return light ? `rgba(70,90,150,${opacity})` : `rgba(180,210,255,${opacity})`;
  }

  const ANG = 12 * (Math.PI / 180);
  const DX  = Math.sin(ANG), DY = Math.cos(ANG);

  function tickDrops(ctx, drops, canvas) {
    for (const d of drops) {
      ctx.beginPath();
      ctx.strokeStyle = rainColor(d.opacity);
      ctx.lineWidth   = d.width;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + DX * d.len, d.y + DY * d.len);
      ctx.stroke();
      d.x += DX * d.speed * 0.65;
      d.y += DY * d.speed;
      if (d.y > canvas.height + d.len) { d.y = -d.len; d.x = Math.random() * canvas.width; }
      if (d.x > canvas.width + 20)     { d.x = -20; }
    }
  }

  /* ── Lightning bolt ──────────────────────────── */
  function boltPoints(x1, y1, x2, y2, spread, depth) {
    if (depth === 0 || Math.hypot(x2 - x1, y2 - y1) < 6)
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * spread;
    const my = (y1 + y2) / 2 + (Math.random() - 0.25) * spread * 0.25;
    return [
      ...boltPoints(x1, y1, mx, my, spread * 0.55, depth - 1),
      ...boltPoints(mx, my, x2, y2, spread * 0.55, depth - 1).slice(1),
    ];
  }

  function drawBolt(ctx, pts, alphaScale) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = `rgba(160,190,255,${0.25 * alphaScale})`;
    ctx.lineWidth   = 7; ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle  = `rgba(240,248,255,${0.95 * alphaScale})`;
    ctx.lineWidth    = 1.8;
    ctx.shadowColor  = 'rgba(180,210,255,1)';
    ctx.shadowBlur   = 18;
    ctx.stroke();
    ctx.shadowBlur   = 0;
  }

  function makeBoltData(canvas) {
    const x  = canvas.width  * (0.15 + Math.random() * 0.7);
    const y2 = canvas.height * (0.65 + Math.random() * 0.25);
    const main = boltPoints(x, -10, x + (Math.random() - 0.5) * 80, y2, 90, 7);
    const branches = [];
    const branchAt = main[Math.floor(main.length * (0.3 + Math.random() * 0.3))];
    if (branchAt) {
      const bx = branchAt.x + (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 80);
      const by = branchAt.y + (y2 - branchAt.y) * (0.4 + Math.random() * 0.35);
      branches.push(boltPoints(branchAt.x, branchAt.y, bx, by, 40, 4));
    }
    return { main, branches };
  }

  function makeLightning(canvas) {
    const state = { phase: 'wait', nextAt: Date.now() + 3000 + Math.random() * 7000, alpha: 0, bolt: null };
    function newBolt() { state.bolt = makeBoltData(canvas); }
    return {
      tick(ctx, now) {
        if (state.phase === 'wait') {
          if (now < state.nextAt) return;
          newBolt(); state.phase = 'flash1'; state.alpha = 0; state.t = now;
        } else if (state.phase === 'flash1') {
          state.alpha = Math.min(1, (now - state.t) / 45);
          if (state.alpha >= 1) { state.phase = 'gap'; state.t = now; }
        } else if (state.phase === 'gap') {
          state.alpha = Math.max(0, 1 - (now - state.t) / 50);
          if (now - state.t > 80) { newBolt(); state.phase = 'flash2'; state.t = now; }
        } else if (state.phase === 'flash2') {
          state.alpha = Math.min(1, (now - state.t) / 35);
          if (state.alpha >= 1) { state.phase = 'fade'; state.t = now; }
        } else if (state.phase === 'fade') {
          state.alpha = Math.max(0, 1 - (now - state.t) / 250);
          if (state.alpha === 0) { state.phase = 'wait'; state.nextAt = now + 4000 + Math.random() * 9000; state.bolt = null; }
        }
        if (state.bolt && state.alpha > 0) {
          drawBolt(ctx, state.bolt.main, state.alpha);
          for (const b of state.bolt.branches) drawBolt(ctx, b, state.alpha * 0.55);
        }
      },
    };
  }

  /* ── Snowflakes ──────────────────────────────── */
  function makeSnow(n, canvas) {
    return Array.from({ length: n }, () => ({
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      r:       Math.random() * 2.5 + 1.2,
      speed:   Math.random() * 1.2 + 0.5,
      sway:    Math.random() * 0.6 + 0.2,
      offset:  Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.5 + 0.4,
    }));
  }

  function tickSnow(ctx, flakes, canvas, time) {
    for (const f of flakes) {
      const swayX = Math.sin(time * 0.0008 * f.sway + f.offset) * 0.6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,235,255,${f.opacity})`;
      ctx.fill();
      f.x += swayX; f.y += f.speed;
      if (f.y > canvas.height + 5) { f.y = -5; f.x = Math.random() * canvas.width; }
      if (f.x > canvas.width  + 10) f.x = -10;
      if (f.x < -10)                f.x = canvas.width + 10;
    }
  }

  /* ── Fog / smoke wisps ───────────────────────── */
  function makeFog(canvas) {
    return Array.from({ length: 18 }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     70  + Math.random() * 110,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    -(0.12 + Math.random() * 0.22),
      alpha: 0.045 + Math.random() * 0.055,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function tickFog(ctx, fog, canvas, time) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const rgb = isLight ? '155,170,185' : '195,212,228';
    for (const w of fog) {
      w.x += w.vx; w.y += w.vy; w.r += 0.07;
      if (w.y < -w.r * 2) { w.y = canvas.height + 60; w.x = Math.random() * canvas.width; w.r = 70 + Math.random() * 90; }
      if (w.x < -w.r * 2)              w.x = canvas.width  + w.r;
      if (w.x >  canvas.width + w.r * 2) w.x = -w.r;
      const pulse = Math.sin(time * 0.00028 + w.phase) * 0.5 + 0.5;
      const a = w.alpha * (0.55 + pulse * 0.45);
      const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.r);
      g.addColorStop(0,    `rgba(${rgb},${a})`);
      g.addColorStop(0.55, `rgba(${rgb},${a * 0.4})`);
      g.addColorStop(1,    `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Night stars ─────────────────────────────── */
  function makeStars(canvas) {
    return Array.from({ length: 140 }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height * 0.82,
      r:     Math.random() * 1.5 + 0.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0009,
    }));
  }

  function tickStars(ctx, stars, time) {
    for (const s of stars) {
      const twinkle = Math.sin(time * s.speed + s.phase) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.22 + twinkle * 0.62})`;
      ctx.fill();
    }
  }

  /* ── Heat shimmer ────────────────────────────── */
  function tickHeat(ctx, canvas, time) {
    /* amber bottom glow */
    const g = ctx.createLinearGradient(0, canvas.height * 0.58, 0, canvas.height);
    g.addColorStop(0, 'rgba(255,120,0,0)');
    g.addColorStop(1, 'rgba(255,85,0,0.055)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* wavy heat lines */
    for (let i = 0; i < 7; i++) {
      const yBase = canvas.height * (0.70 + i * 0.045);
      const phase = time * 0.0007 + i * 1.4;
      const amp   = 1.6 + Math.sin(time * 0.0005 + i) * 1.1;
      ctx.beginPath(); ctx.moveTo(0, yBase);
      for (let x = 0; x <= canvas.width; x += 5)
        ctx.lineTo(x, yBase + Math.sin(x * 0.009 + phase) * amp);
      ctx.strokeStyle = `rgba(255,145,35,${0.026 + i * 0.004})`;
      ctx.lineWidth   = 1; ctx.stroke();
    }
  }

  /* ── Cold tint overlay ───────────────────────── */
  function tickColdTint(ctx, canvas, time) {
    const pulse = Math.sin(time * 0.00025) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(80,140,255,${0.038 + pulse * 0.022})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /* ── Main effect runner ──────────────────────── */
  function startEffect(effect, temp) {
    const hasColdTint = typeof temp === 'number' && temp <= 15 && effect !== 'snow';
    if (effect === 'none' && !hasColdTint) return;

    const { canvas, ctx } = createCanvas();
    const dropCounts = { drizzle: 40, 'rain-light': 100, 'rain-medium': 220, 'rain-heavy': 400, storm: 320 };
    const isRain   = !['fog','snow','none','stars','heat'].includes(effect);
    const drops    = isRain           ? makeDrops(dropCounts[effect] || 150, canvas, effect) : [];
    const fog      = effect === 'fog'   ? makeFog(canvas)    : [];
    const flakes   = effect === 'snow'  ? makeSnow(140, canvas) : [];
    const stars    = effect === 'stars' ? makeStars(canvas)  : [];
    const lightning = effect === 'storm' ? makeLightning(canvas) : null;

    function draw() {
      if (document.hidden) { requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      if (effect === 'heat')   tickHeat(ctx, canvas, now);
      if (drops.length)        tickDrops(ctx, drops, canvas);
      if (fog.length)          tickFog(ctx, fog, canvas, now);
      if (flakes.length)       tickSnow(ctx, flakes, canvas, now);
      if (stars.length)        tickStars(ctx, stars, now);
      if (lightning)           lightning.tick(ctx, now);
      if (hasColdTint)         tickColdTint(ctx, canvas, now);
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ── Fetch + cache (location-keyed) ─────────── */
  async function init() {
    try {
      const ov = sessionStorage.getItem('wx_test');
      if (ov) {
        const d = JSON.parse(ov);
        injectNavWidget(d.temp, d.code, d.city || 'Sylhet', d.feelsLike ?? d.temp, d.humidity, d.wind, d.isDay !== false);
        startEffect(d.effect, d.temp);
        return;
      }
    } catch (_) {}

    const { lat, lon, fallback } = await getLocation();
    const key = cacheKey(lat, lon);

    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const d = JSON.parse(cached);
        if (Date.now() - d.ts < CACHE_TTL) {
          injectNavWidget(d.temp, d.code, d.city, d.feelsLike, d.humidity, d.wind, d.isDay);
          startEffect(d.effect, d.temp);
          return;
        }
      }
    } catch (_) {}

    try {
      const [res, city] = await Promise.all([
        fetch(buildAPI(lat, lon)),
        fallback ? Promise.resolve('Sylhet') : getCityName(lat, lon),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      const cur  = data.current || {};
      const code      = cur.weather_code          ?? 0;
      const precip    = cur.precipitation         ?? 0;
      const temp      = cur.temperature_2m        ?? 30;
      const feelsLike = cur.apparent_temperature  ?? temp;
      const humidity  = cur.relative_humidity_2m  ?? null;
      const wind      = cur.wind_speed_10m        ?? 0;
      const isDay     = cur.is_day                !== 0;
      const effect    = codeToEffect(code, precip, temp, isDay);
      try {
        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), code, temp, effect, city, feelsLike, humidity, wind, isDay }));
      } catch (_) {}
      injectNavWidget(temp, code, city, feelsLike, humidity, wind, isDay);
      startEffect(effect, temp);
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
