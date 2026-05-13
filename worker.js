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
// Endpoints:
//   GET  /sheet?name=TabName[&type=bot]   → Google Sheets GVIZ proxy
//   GET  /fetch?id=SHEET_ID[&sheet=Tab]   → Arbitrary sheet (exam/routine)
//   POST /sms   body: { phone, message }  → SMS gateway proxy
//   GET  /drive?folder=FOLDER_ID          → Google Drive folder listing

const ALLOWED_ORIGINS = [
  'https://lucse62.xyz',
  'https://www.lucse62.xyz',
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

      // ── GET /sheet?name=TabName[&type=bot] ───────────────────────────
      if (p === '/sheet') {
        const name = url.searchParams.get('name');
        const type = url.searchParams.get('type') || 'main';
        if (!name) return errResp(cors, 400, 'Missing name');
        const id = type === 'bot' ? env.BOT_SHEET_ID : env.MAIN_SHEET_ID;
        if (!id)   return errResp(cors, 500, 'Not configured');
        return gvizProxy(id, name, cors);
      }

      // ── GET /fetch?id=SHEET_ID[&sheet=Tab] ───────────────────────────
      if (p === '/fetch') {
        const id  = url.searchParams.get('id');
        const tab = url.searchParams.get('sheet') || '';
        if (!id) return errResp(cors, 400, 'Missing id');
        return gvizProxy(id, tab, cors);
      }

      // ── POST /sms  { phone, message } ────────────────────────────────
      if (p === '/sms' && request.method === 'POST') {
        const { phone, message } = await request.json();
        if (!phone || !message) return errResp(cors, 400, 'Missing phone or message');
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
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
        });
        const text = await r.text();
        return new Response(text, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
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
        const r = await fetch(driveUrl);
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
