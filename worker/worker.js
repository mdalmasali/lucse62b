// ── CSE 62B Portal · Cloudflare Worker ──────────────────────────────────────
// Deploy this at: Cloudflare Dashboard → Workers → Create Worker → paste code
// Custom domain:  api.lucse62.xyz  (add route in Cloudflare DNS)
//
// Required Worker Secrets (Settings → Variables → Add secret):
//   MAIN_SHEET_ID   → 1Zv2PtPBmhVWAl7SeZnAXCpMiDZx_PDczeM6r-DrvPxY
//   BOT_SHEET_ID    → 1oPrkupGA43ydBl-qL8XpAFjUpmPZqOyVfJq5iqn50kc
//   SMS_API_KEY     → (your bulksmsbd API key)
//   SMS_SENDER_ID   → (your sender ID)
//   DRIVE_API_KEY   → (your Google Drive API key)
//
// Required KV Namespace (Settings → Variables → KV Namespace Bindings):
//   SMS_RATE        → create a KV namespace named "SMS_RATE" and bind it here
//
// Endpoints:
//   GET  /sheet?name=TabName[&type=bot]   → Google Sheets GVIZ proxy
//   GET  /fetch?id=SHEET_ID[&sheet=Tab]   → Arbitrary sheet (exam/routine)
//   POST /sms   body: { phone, message }  → SMS gateway proxy
//   GET  /drive?folder=FOLDER_ID          → Google Drive folder listing

const ALLOWED_ORIGINS = [
  'https://lucse62b.xyz',
  'https://www.lucse62b.xyz',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors   = {
      'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const p = url.pathname;

      // ── GET /lookup?id=STUDENT_ID — single student lookup, never exposes full sheet ──
      if (p === '/lookup') {
        const sid = url.searchParams.get('id');
        if (!sid) return errResp(cors, 400, 'Missing id');
        if (!/^\d{8,16}$/.test(sid)) return errResp(cors, 400, 'Invalid ID');
        const id = env.MAIN_SHEET_ID;
        if (!id) return errResp(cors, 500, 'Not configured');
        const tq = `select * where B='${sid}'`;
        const u  = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=Student%20Info&tq=${encodeURIComponent(tq)}`;
        const r  = await fetch(u);
        const text = await r.text();
        const m = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/);
        if (!m) return errResp(cors, 502, 'Bad upstream');
        const parsed = JSON.parse(m[1]);
        const rows   = parsed.table?.rows || [];
        if (!rows.length) return jsonResp(cors, { found: false });
        const cells  = (rows[0].c || []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.f || c.v).trim() : '');
        return jsonResp(cors, { found: true, id: cells[1] || sid, name: cells[2] || 'Student', phone: cells[3] || '' });
      }

      // ── GET /sheet?name=TabName[&type=bot] ───────────────────────────
      if (p === '/sheet') {
        const name = url.searchParams.get('name');
        const type = url.searchParams.get('type') || 'main';
        if (!name) return errResp(cors, 400, 'Missing name');
        const id = type === 'bot' ? env.BOT_SHEET_ID : env.MAIN_SHEET_ID;
        if (!id)   return errResp(cors, 500, 'Not configured');
        // Strip phone column (index 3) from Student Info to prevent exposure
        if (name === 'Student Info') return gvizProxyStrip(id, name, [3], cors);
        return gvizProxy(id, name, cors);
      }

      // ── GET /fetch?id=SHEET_ID[&sheet=Tab] ───────────────────────────
      if (p === '/fetch') {
        const id  = url.searchParams.get('id');
        const tab = url.searchParams.get('sheet') || '';
        if (!id) return errResp(cors, 400, 'Missing id');
        if (!/^[A-Za-z0-9_-]{20,60}$/.test(id)) return errResp(cors, 400, 'Invalid sheet ID');
        return gvizProxy(id, tab, cors);
      }

      // ── POST /sms  { phone, message } ────────────────────────────────
      if (p === '/sms' && request.method === 'POST') {
        const { phone, message } = await request.json();
        if (!phone || !message) return errResp(cors, 400, 'Missing phone or message');
        /* Only allow Bangladeshi mobile numbers and short OTP messages */
        if (!/^01[3-9]\d{8}$/.test(String(phone).trim()))
          return errResp(cors, 400, 'Invalid phone number');
        if (String(message).length > 160)
          return errResp(cors, 400, 'Message too long');

        // Rate limiting via KV: max 5/hour and 20/day per IP
        if (env.SMS_RATE) {
          const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
          const now = Date.now();
          const hKey = `sms:h:${ip}:${Math.floor(now / 3600000)}`;
          const dKey = `sms:d:${ip}:${Math.floor(now / 86400000)}`;
          const [hRaw, dRaw] = await Promise.all([env.SMS_RATE.get(hKey), env.SMS_RATE.get(dKey)]);
          const hCount = parseInt(hRaw || '0');
          const dCount = parseInt(dRaw || '0');
          if (hCount >= 5 || dCount >= 20) return errResp(cors, 429, 'Rate limit exceeded');
          await Promise.all([
            env.SMS_RATE.put(hKey, String(hCount + 1), { expirationTtl: 3600 }),
            env.SMS_RATE.put(dKey, String(dCount + 1), { expirationTtl: 86400 }),
          ]);
        }

        const smsUrl =
          `https://bulksmsbd.net/api/smsapi?api_key=${env.SMS_API_KEY}` +
          `&type=text&number=${encodeURIComponent(phone)}` +
          `&senderid=${encodeURIComponent(env.SMS_SENDER_ID)}` +
          `&message=${encodeURIComponent(message)}`;
        await fetch(smsUrl);
        return jsonResp(cors, { ok: true });
      }

      // ── POST /result  { student_id, birth_date } ─────────────────────
      if (p === '/result' && request.method === 'POST') {
        const { student_id, birth_date } = await request.json();
        if (!student_id || !birth_date) return errResp(cors, 400, 'Missing student_id or birth_date');
        const body = new URLSearchParams({ action: 'get-result', student_id, birth_date });
        const r = await fetch('https://lus.ac.bd/wp-admin/admin-ajax.php', {
          method: 'POST', body,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-requested-with': 'XMLHttpRequest',
          },
        });
        const text = await r.text();
        if (text.trimStart().startsWith('<')) return errResp(cors, 503, 'LUS temporarily unavailable');
        return new Response(text, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
      }

      // ── GET /gallery?folder=FOLDER_ID[&limit=N] — images from folder or subfolders ──
      if (p === '/gallery') {
        const folder = url.searchParams.get('folder');
        if (!folder) return errResp(cors, 400, 'Missing folder');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);
        if (!env.DRIVE_API_KEY) return errResp(cors, 500, 'Not configured');
        const driveHeaders = { 'Referer': 'https://lucse62b.xyz/' };
        // First try direct images in the folder
        const directRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folder}' in parents and mimeType contains 'image/' and trashed=false`)}&pageSize=${limit}&fields=files(id)&key=${env.DRIVE_API_KEY}`,
          { headers: driveHeaders }
        );
        const directFiles = (await directRes.json()).files || [];
        if (directFiles.length > 0) return jsonResp(cors, { files: directFiles });
        // Fall back to images inside subfolders
        const fRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&key=${env.DRIVE_API_KEY}`,
          { headers: driveHeaders }
        );
        const subfolders = (await fRes.json()).files || [];
        const batches = await Promise.all(subfolders.map(f =>
          fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${f.id}' in parents and mimeType contains 'image/' and trashed=false`)}&pageSize=${limit}&fields=files(id)&key=${env.DRIVE_API_KEY}`,
            { headers: driveHeaders })
            .then(r => r.json()).then(d => d.files || []).catch(() => [])
        ));
        return jsonResp(cors, { files: batches.flat() });
      }

      // ── GET /drive?folder=FOLDER_ID ──────────────────────────────────
      if (p === '/drive') {
        const folder = url.searchParams.get('folder');
        if (!folder) return errResp(cors, 400, 'Missing folder');
        const driveUrl =
          `https://www.googleapis.com/drive/v3/files` +
          `?q=%27${folder}%27+in+parents+and+trashed%3Dfalse` +
          `&orderBy=name&fields=files(id%2Cname%2CmimeType)` +
          `&key=${env.DRIVE_API_KEY}`;
        const referer = request.headers.get('Referer') || 'https://lucse62b.xyz/';
        const r = await fetch(driveUrl, { headers: { 'Referer': referer } });
        const d = await r.json();
        return jsonResp(cors, d);
      }

      return new Response('Not found', { status: 404, headers: cors });

    } catch (e) {
      return errResp(cors, 500, 'Internal error');
    }
  },
};

async function gvizProxy(sheetId, tab, cors) {
  let u = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  if (tab) u += `&sheet=${encodeURIComponent(tab)}`;
  const r    = await fetch(u);
  const text = await r.text();
  const m    = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (!m) return errResp(cors, 502, 'Bad upstream response');
  return new Response(m[1], { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function gvizProxyStrip(sheetId, tab, stripCols, cors) {
  let u = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  if (tab) u += `&sheet=${encodeURIComponent(tab)}`;
  const r    = await fetch(u);
  const text = await r.text();
  const m    = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (!m) return errResp(cors, 502, 'Bad upstream response');
  const data = JSON.parse(m[1]);
  if (data.table) {
    if (data.table.cols) data.table.cols = data.table.cols.map((c, i) => stripCols.includes(i) ? { label: '', type: 'string' } : c);
    if (data.table.rows) data.table.rows = data.table.rows.map(row => ({
      ...row,
      c: (row.c || []).map((cell, i) => stripCols.includes(i) ? null : cell)
    }));
  }
  return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonResp(cors, data) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function errResp(cors, status, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
