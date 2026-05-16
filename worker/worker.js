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
        // Only allow requests originating from the portal (blocks direct URL access & external scraping)
        if (!ALLOWED_ORIGINS.includes(origin)) return errResp(cors, 403, 'Forbidden');

        const sid = url.searchParams.get('id');
        if (!sid) return errResp(cors, 400, 'Missing id');
        if (!/^\d{8,16}$/.test(sid)) return errResp(cors, 400, 'Invalid ID');

        // Rate limit: max 10 lookups per hour per IP
        if (env.SMS_RATE) {
          const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
          const now = Date.now();
          const key = `lookup:h:${ip}:${Math.floor(now / 3600000)}`;
          const raw = await env.SMS_RATE.get(key);
          const cnt = parseInt(raw || '0');
          if (cnt >= 10) return errResp(cors, 429, 'Too many lookups — try again later');
          await env.SMS_RATE.put(key, String(cnt + 1), { expirationTtl: 3600 });
        }

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
        return jsonResp(cors, { found: true, id: cells[1] || sid, name: cells[2] || 'Student' });
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

      // ── POST /send-otp  { student_id } — looks up phone internally, sends SMS OTP ──
      if (p === '/send-otp' && request.method === 'POST') {
        if (!ALLOWED_ORIGINS.includes(origin)) return errResp(cors, 403, 'Forbidden');
        const { student_id } = await request.json();
        if (!student_id) return errResp(cors, 400, 'Missing student_id');
        if (!/^\d{8,16}$/.test(String(student_id))) return errResp(cors, 400, 'Invalid ID');

        // Rate limit: max 5/day per IP
        if (env.SMS_RATE) {
          const ip   = request.headers.get('CF-Connecting-IP') || 'unknown';
          const dKey = `otp:d:${ip}:${Math.floor(Date.now() / 86400000)}`;
          const dRaw = await env.SMS_RATE.get(dKey);
          const dCnt = parseInt(dRaw || '0');
          if (dCnt >= 5) return errResp(cors, 429, 'Daily OTP limit reached');
          await env.SMS_RATE.put(dKey, String(dCnt + 1), { expirationTtl: 86400 });
        }

        // Look up phone from sheet
        const sid2 = String(student_id);
        const sheetId = env.MAIN_SHEET_ID;
        if (!sheetId) return errResp(cors, 500, 'Not configured');
        const tq2 = `select * where B='${sid2}'`;
        const u2  = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Student%20Info&tq=${encodeURIComponent(tq2)}`;
        const r2  = await fetch(u2);
        const t2  = await r2.text();
        const m2  = t2.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/);
        if (!m2) return errResp(cors, 502, 'Bad upstream');
        const parsed2 = JSON.parse(m2[1]);
        const rows2   = parsed2.table?.rows || [];
        if (!rows2.length) return errResp(cors, 404, 'Student not found');
        const cells2 = (rows2[0].c || []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.f || c.v).trim() : '');
        let phone2 = (cells2[3] || '').replace(/\s+/g, '');
        if (phone2.length === 10 && phone2.startsWith('1')) phone2 = '0' + phone2;
        if (phone2.startsWith('+88')) phone2 = phone2.substring(3);
        else if (phone2.startsWith('88') && phone2.length === 13) phone2 = phone2.substring(2);
        if (!/^01[3-9]\d{8}$/.test(phone2)) return errResp(cors, 400, 'No valid phone for this student');

        // Generate OTP and store in KV (5-minute TTL)
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        const otp = String(arr[0] % 1000000).padStart(6, '0');
        if (env.SMS_RATE) {
          await env.SMS_RATE.put(`otp:${sid2}`, otp, { expirationTtl: 300 });
        }

        // Send SMS
        const smsUrl2 =
          `https://bulksmsbd.net/api/smsapi?api_key=${env.SMS_API_KEY}` +
          `&type=text&number=${encodeURIComponent(phone2)}` +
          `&senderid=${encodeURIComponent(env.SMS_SENDER_ID)}` +
          `&message=${encodeURIComponent(`Your CSE 62B PORTAL OTP is ${otp}`)}`;
        await fetch(smsUrl2);

        const masked = phone2.substring(0, 5) + '***' + phone2.slice(-3);
        return jsonResp(cors, { ok: true, masked });
      }

      // ── POST /verify-otp  { student_id, otp } — server-side OTP check ──
      if (p === '/verify-otp' && request.method === 'POST') {
        if (!ALLOWED_ORIGINS.includes(origin)) return errResp(cors, 403, 'Forbidden');
        const { student_id, otp } = await request.json();
        if (!student_id || !otp) return errResp(cors, 400, 'Missing fields');
        if (!env.SMS_RATE) return errResp(cors, 500, 'Not configured');
        const stored = await env.SMS_RATE.get(`otp:${String(student_id)}`);
        if (!stored || stored !== String(otp).trim()) return jsonResp(cors, { valid: false });
        await env.SMS_RATE.delete(`otp:${String(student_id)}`);
        return jsonResp(cors, { valid: true });
      }

      // ── POST /my-phone  { student_id, birth_date } — returns verified student's own phone ──
      if (p === '/my-phone' && request.method === 'POST') {
        if (!ALLOWED_ORIGINS.includes(origin)) return errResp(cors, 403, 'Forbidden');
        const { student_id, birth_date } = await request.json();
        if (!student_id || !birth_date) return errResp(cors, 400, 'Missing fields');
        if (!/^\d{8,16}$/.test(String(student_id))) return errResp(cors, 400, 'Invalid ID');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birth_date))) return errResp(cors, 400, 'Invalid date');

        // Rate limit: max 10/hour per IP
        if (env.SMS_RATE) {
          const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
          const key = `phone:h:${ip}:${Math.floor(Date.now() / 3600000)}`;
          const raw = await env.SMS_RATE.get(key);
          const cnt = parseInt(raw || '0');
          if (cnt >= 10) return errResp(cors, 429, 'Too many requests');
          await env.SMS_RATE.put(key, String(cnt + 1), { expirationTtl: 3600 });
        }

        // Fetch phone from sheet
        const sid3 = String(student_id);
        const shId = env.MAIN_SHEET_ID;
        if (!shId) return errResp(cors, 500, 'Not configured');
        const tq3 = `select * where B='${sid3}'`;
        const u3  = `https://docs.google.com/spreadsheets/d/${shId}/gviz/tq?tqx=out:json&sheet=Student%20Info&tq=${encodeURIComponent(tq3)}`;
        const r3  = await fetch(u3);
        const t3  = await r3.text();
        const m3  = t3.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/);
        if (!m3) return errResp(cors, 502, 'Bad upstream');
        const d3 = JSON.parse(m3[1]);
        const rows3 = d3.table?.rows || [];
        if (!rows3.length) return errResp(cors, 404, 'Student not found');
        const cells3 = (rows3[0].c || []).map(c => (c && c.v !== null && c.v !== undefined) ? String(c.f || c.v).trim() : '');
        let phone3 = (cells3[3] || '').replace(/\s+/g, '');
        if (phone3.length === 10 && phone3.startsWith('1')) phone3 = '0' + phone3;
        if (phone3.startsWith('+88')) phone3 = phone3.substring(3);
        else if (phone3.startsWith('88') && phone3.length === 13) phone3 = phone3.substring(2);
        if (!/^01[3-9]\d{8}$/.test(phone3)) return errResp(cors, 400, 'No phone on record');

        // Verify DOB via Supabase (anon key is already public in client code)
        const SUPA_URL3 = 'https://ftvtlqxpalwvyserujuh.supabase.co';
        const SUPA_KEY3 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';
        const dobR = await fetch(`${SUPA_URL3}/rest/v1/rpc/get_student_dob`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY3, 'Authorization': `Bearer ${SUPA_KEY3}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_student_id: sid3 }),
        }).catch(() => null);
        if (!dobR || !dobR.ok) return errResp(cors, 503, 'Verification unavailable');
        const storedDob = await dobR.json();
        if (!storedDob || storedDob !== String(birth_date)) return errResp(cors, 401, 'DOB mismatch');

        return jsonResp(cors, { phone: phone3 });
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
