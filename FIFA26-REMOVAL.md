# 🏆 FIFA World Cup 2026 Theme — Removal Guide

World Cup শেষ হলে (Final: **July 19, 2026**) site কে আগের normal state এ ফেরাতে এই guide।

> ⏰ Note: Theme টা এমনিতেই **July 21, 2026** এর পর auto-disable হয়ে যাবে
> (`fifa26.js` এর ভেতরে date check আছে)। কিন্তু code পরিষ্কার রাখতে
> পুরোপুরি remove করে দেওয়া ভালো।

---

## ⚡ ONE-CLICK REMOVAL (recommended)

Project root এ **`remove-fifa26.bat`** আছে — ওটা **double-click** করলেই সব হয়ে যাবে:

1. ✅ Theme files delete (`fifa26.js`, `fifa26.css`)
2. ✅ `theme.js` থেকে loader line remove
3. ✅ `worker.js` থেকে `/fifa` route remove (FIFA26-START/END markers ধরে)
4. ✅ Worker re-deploy (`npx wrangler deploy`)
5. ✅ এই guide + script নিজেও delete
6. ✅ Git commit + push

ব্যস! তারপর site hard-refresh (`Ctrl+Shift+R`) করে verify করো।

---

## 📋 FIFA26 theme এ কী কী আছে (full inventory)

### নতুন files (delete করতে হবে):
| File | কী আছে |
|------|--------|
| `assets/js/fifa26.js` | পুরো theme logic — banner, live ticker, match center modal, live tracker (timeline+stats), watch buttons, countdown |
| `assets/css/fifa26.css` | সব styling — green/gold color shift, banner, modal, match cards, timeline, stat bars, watch chips |
| `remove-fifa26.bat` | One-click removal script (নিজেই নিজেকে delete করে) |
| `FIFA26-REMOVAL.md` | এই file |

### Modified files (FIFA26 অংশ মুছতে হবে):

**`assets/js/theme.js`** — একদম শেষের ২ line:
```js
/* FIFA26: temporary World Cup 2026 theme — delete this line (and the two fifa26 asset files) to remove */
document.head.appendChild(Object.assign(document.createElement('script'), { src: '/assets/js/fifa26.js', defer: true }));
```

**`worker/worker.js`** — `// FIFA26-START` থেকে `// FIFA26-END` পর্যন্ত পুরো block।
এর ভেতরে আছে `/fifa` route:
- `/fifa?dates=YYYYMMDD[-YYYYMMDD]` → match scores/schedule (ESPN proxy, 60s cache)
- `/fifa?event=ID` → match detail: goal/card/sub timeline + stats (30s cache)

Worker change এর পর re-deploy লাগবে: `cd worker && npx wrangler deploy`

### External dependencies (কোনো cleanup লাগবে না):
- ESPN public API (worker দিয়ে proxy হয়) — কোনো key/account নেই
- Watch links: tsports.com, toffeelive.com, bioscopelive.com — শুধু external link

### Visitors দের browser এ থাকা data (harmless, এমনিই expire হবে):
- `localStorage`: `f26_c_*` (match data cache)
- `sessionStorage`: `f26_off` (banner hide flag)

---

## 🔧 Manual removal (script কাজ না করলে)

1. Delete: `assets/js/fifa26.js`, `assets/css/fifa26.css`
2. `assets/js/theme.js` → শেষের FIFA26 comment + loader line delete
3. `worker/worker.js` → `// FIFA26-START` থেকে `// FIFA26-END` পর্যন্ত delete
4. `cd worker && npx wrangler deploy`
5. Delete: `FIFA26-REMOVAL.md`, `remove-fifa26.bat`
6. `git add -A && git commit -m "chore: remove FIFA26 theme" && git push`

## ✅ Verify

1. Site hard-refresh (`Ctrl+Shift+R`)
2. সবুজ-সোনালি World Cup banner নেই
3. Accent color আবার purple (`#7c3aed`)
4. Console এ `fifa26.js 404` error নেই
5. `https://lucse62b-api.sy164425.workers.dev/fifa` → 404 দেয়

---

*Theme added: June 11, 2026 · Live tracker + watch buttons added same day*
