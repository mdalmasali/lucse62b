# 🏆 FIFA World Cup 2026 Theme — Removal Guide

World Cup শেষ হলে (Final: **July 19, 2026**) site কে আগের normal state এ ফেরাতে
নিচের steps follow করো। সব মিলিয়ে **২টা file delete + ২টা file edit**।

> ⏰ Note: Theme টা এমনিতেই **July 21, 2026** এর পর auto-disable হয়ে যাবে
> (`fifa26.js` এর ভেতরে date check আছে)। কিন্তু code পরিষ্কার রাখতে
> নিচের মতো পুরোপুরি remove করে দেওয়া ভালো।

---

## Step 1 — ২টা file DELETE করো

| File | কী ছিল |
|------|--------|
| `assets/js/fifa26.js` | পুরো theme logic — banner, live scores, match center modal |
| `assets/css/fifa26.css` | Theme এর সব styling — color shift, banner, modal |

```
del "assets\js\fifa26.js"
del "assets\css\fifa26.css"
```

## Step 2 — `assets/js/theme.js` থেকে loader line মুছো

File এর **একদম শেষে** এই ২টা line আছে — delete করে দাও:

```js
/* FIFA26: temporary World Cup 2026 theme — delete this line (and the two fifa26 asset files) to remove */
document.head.appendChild(Object.assign(document.createElement('script'), { src: '/assets/js/fifa26.js', defer: true }));
```

## Step 3 — `worker/worker.js` থেকে `/fifa` route মুছো (optional কিন্তু recommended)

`worker/worker.js` এ এই comment দিয়ে শুরু হওয়া block টা খুঁজো:

```js
// ── GET /fifa?dates=YYYYMMDD[-YYYYMMDD] — World Cup 2026 scores (ESPN proxy) ──
// FIFA26: temporary World Cup theme endpoint — safe to delete after the tournament.
if (p === '/fifa') {
```

পুরো `if (p === '/fifa') { ... }` block টা delete করো
(পরের route `// ── GET /hidden-cols...` এর আগ পর্যন্ত)।

তারপর worker re-deploy করো:

```
cd worker
npx wrangler deploy
```

## Step 4 — এই file টাও delete করো

```
del "FIFA26-REMOVAL.md"
```

## Step 5 — Commit & push

```
git add -A
git commit -m "chore: remove FIFA World Cup 2026 theme (tournament over)"
git push
```

---

## ✅ Verify

1. Site hard-refresh করো (`Ctrl+Shift+R`)
2. উপরের সবুজ-সোনালি World Cup banner আর নেই
3. Site এর accent color আবার আগের **purple** (`#7c3aed`) এ ফিরে এসেছে
4. Console এ কোনো `fifa26.js 404` error নেই

## 🧹 Bonus cleanup (optional)

Visitors দের browser এ কিছু cache data থেকে যেতে পারে — এগুলো ক্ষতিকর না,
এমনিতেই পড়ে থাকবে। চাইলে কখনো clear করার দরকার নেই:
- `localStorage`: `f26_c_*` keys (match data cache)
- `sessionStorage`: `f26_off` (banner hide flag)

---

*Theme added: June 11, 2026 (commit `8ed2429`)*
