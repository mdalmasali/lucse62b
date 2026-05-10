/* ─── Exam Routine (Mid Term & Final Term) ─── */
/* Globals from info.html: getSheetIdFromRoutineTab, fetchSheet, sheetRows,
   courseColor, escH, loadScript */

let _examCache = null;

function fetchExamTab(sheetId) {
  return new Promise((resolve, reject) => {
    const cb = `ex_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const s  = document.createElement('script');
    const t  = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 15000);
    function cleanup() { clearTimeout(t); delete window[cb]; s.remove(); }
    window[cb] = d => { cleanup(); resolve(d); };
    s.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json;responseHandler:${cb}&headers=0`;
    s.onerror = () => { cleanup(); reject(new Error('Load error')); };
    document.body.appendChild(s);
  });
}

function normExamDate(raw) {
  if (!raw) return '';
  const dm = String(raw).match(/^Date\((\d+),(\d+),(\d+)/);
  if (dm) {
    const d = new Date(+dm[1], +dm[2], +dm[3]);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  }
  return String(raw).trim();
}

function fmtExamDate(s) {
  const m = (s||'').match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return s;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(m[1])} ${MON[parseInt(m[2])-1]} ${m[3]}`;
}

function examDateObj(s) {
  const m = (s||'').match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2]-1, +m[1]); d.setHours(0,0,0,0); return d;
}

function parseExamRoutine(data, targetBatch, targetSection) {
  const table = data?.table;
  if (!table) return null;

  const allRows = (table.rows || []).map(r =>
    (r.c || []).map(c => {
      if (!c || c.v == null) return '';
      return normExamDate(c.v) || String(c.v).trim();
    })
  );

  let dayHeaderIdx = -1, dayStartCol = -1;
  for (let r = 0; r < Math.min(allRows.length, 15); r++) {
    for (let c = 0; c < allRows[r].length; c++) {
      if (/^day[-\s]?1$/i.test(allRows[r][c])) {
        dayHeaderIdx = r; dayStartCol = c; break;
      }
    }
    if (dayHeaderIdx >= 0) break;
  }
  if (dayHeaderIdx < 0) return null;

  const dayRow  = allRows[dayHeaderIdx];
  const dayCols = dayRow.reduce((a, cell, i) => {
    if (/^day[-\s]?\d+$/i.test(cell)) a.push(i);
    return a;
  }, []);

  const dateRow    = allRows[dayHeaderIdx + 1] || [];
  const timeRow    = allRows[dayHeaderIdx + 2] || [];
  const weekdayRow = allRows[dayHeaderIdx + 3] || [];

  let batchCol = dayStartCol - 2, sectionCol = dayStartCol - 1;
  for (let r = Math.max(0, dayHeaderIdx - 1); r <= dayHeaderIdx + 4; r++) {
    (allRows[r] || []).forEach((cell, i) => {
      if (/^batch$/i.test(cell))   batchCol   = i;
      if (/^section$/i.test(cell)) sectionCol = i;
    });
  }

  const examDays = dayCols.map(col => ({
    col, label: dayRow[col] || '',
    date: dateRow[col] || '', time: timeRow[col] || '', weekday: weekdayRow[col] || ''
  }));

  const dataStart = dayHeaderIdx + 4;
  let currentBatch = '';

  for (let r = dataStart; r < allRows.length; r++) {
    const row = allRows[r];
    if (row[batchCol]) currentBatch = row[batchCol];
    const section = row[sectionCol] || '';
    if (currentBatch === String(targetBatch) && section === targetSection) {
      const exams = examDays.map(day => ({
        ...day,
        course: (row[day.col] || '').replace(/\s*\(\d+\)\s*/g, '').trim()
      })).filter(e => e.course);
      return exams;
    }
  }
  return null;
}

async function loadExamRoutine(body, type) {
  const label   = type === 'mid' ? 'Mid Term' : 'Final Term';
  const keyword = type === 'mid' ? 'mid term' : 'final term';

  body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading...</div>';

  try {
    const sheetId = await getSheetIdFromRoutineTab(keyword);
    if (!sheetId) {
      body.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-link-slash" style="opacity:0.2;font-size:2rem;display:block;margin-bottom:14px;"></i>
        <p style="font-weight:600;">No ${label} Routine linked yet.</p>
        <p style="font-size:0.78rem;margin-top:8px;opacity:0.65;">In your Routine tab, add a row with<br>
        <strong style="color:var(--accent-bright);">${keyword}</strong> in col A and the Google Sheet URL in col B.</p>
      </div>`;
      return;
    }

    const [cpgData, examData] = await Promise.all([
      fetchSheet('CPG_Courses').catch(() => null),
      fetchExamTab(sheetId)
    ]);

    const courseInfo = {};
    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[1] && !['code','title','course'].includes(r[1].toLowerCase()))
        .forEach(r => { courseInfo[r[1].trim().toUpperCase()] = { name: r[0].trim() }; });
    }

    const exams = parseExamRoutine(examData, '62', 'B');
    if (!exams || !exams.length) {
      body.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-calendar-xmark" style="opacity:0.2;font-size:2rem;display:block;margin-bottom:14px;"></i>
        <p>No exams found for Batch 62, Section B.</p>
      </div>`;
      return;
    }

    _examCache = { type, label, exams, courseInfo };

    const today = new Date(); today.setHours(0,0,0,0);
    let cards = '';
    exams.forEach(exam => {
      const color   = courseColor(exam.course);
      const info    = courseInfo[exam.course.toUpperCase()] || {};
      const dObj    = examDateObj(exam.date);
      const isPast  = dObj && dObj < today;
      const isToday = dObj && dObj.getTime() === today.getTime();
      cards += `<div class="exam-card${isPast?' is-past':''}${isToday?' is-today':''}" style="border-left-color:${color};">
        <div class="exam-card-left">
          <span class="exam-card-daynum">${escH(exam.label)}</span>
          <span class="exam-card-wday">${escH(exam.weekday)}</span>
          <span class="exam-card-date">${escH(fmtExamDate(exam.date))}</span>
        </div>
        <div class="exam-card-right">
          <div>
            <span class="exam-card-code" style="color:${color};">${escH(exam.course)}</span>
            ${isToday ? '<span class="exam-today-tag">Today</span>' : ''}
          </div>
          ${info.name ? `<div class="exam-card-name">${escH(info.name)}</div>` : ''}
          <div class="exam-card-time"><i class="fa-regular fa-clock" style="margin-right:5px;"></i>${escH(exam.time)}</div>
        </div>
      </div>`;
    });

    body.innerHTML = `
      <div class="rt-sync">
        <div class="rt-sync-dot"></div>
        <span>${label} Exam Routine &nbsp;·&nbsp; Batch 62, Section B &nbsp;·&nbsp; Spring 2026</span>
      </div>
      <div class="exam-meta">
        <span class="exam-count-badge">${exams.length} Exam${exams.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="exam-cards">${cards}</div>
      <div class="rt-dl-bar">
        <button class="rt-dl-btn" onclick="downloadExamImage(this)">
          <i class="fa-solid fa-image"></i> Image Download
        </button>
        <button class="rt-dl-btn rt-dl-btn-pdf" onclick="downloadExamPDF(this)">
          <i class="fa-solid fa-file-pdf"></i> PDF Download
        </button>
      </div>`;

  } catch(e) {
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load ${label} routine.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${e.message}</p>
    </div>`;
  }
}

function buildExamPrintTemplate() {
  if (!_examCache) return '';
  const { label, exams, courseInfo } = _examCache;
  const today = new Date(); today.setHours(0,0,0,0);

  let rows = '';
  exams.forEach((exam, ri) => {
    const color  = courseColor(exam.course);
    const info   = courseInfo[exam.course.toUpperCase()] || {};
    const dObj   = examDateObj(exam.date);
    const isPast = dObj && dObj < today;
    const rowBg  = ri % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
    rows += `<tr style="opacity:${isPast?0.4:1};">
      <td style="padding:11px 16px;text-align:center;font-size:11px;font-weight:700;color:#a78bfa;border:1px solid rgba(255,255,255,0.06);background:${rowBg};white-space:nowrap;">${escH(exam.label)}</td>
      <td style="padding:11px 16px;font-size:12px;color:#e2e8f0;border:1px solid rgba(255,255,255,0.06);background:${rowBg};white-space:nowrap;">${escH(exam.weekday)}, ${escH(fmtExamDate(exam.date))}</td>
      <td style="padding:11px 16px;font-size:12px;color:#38bdf8;font-weight:600;border:1px solid rgba(255,255,255,0.06);background:${rowBg};white-space:nowrap;">${escH(exam.time)}</td>
      <td style="padding:11px 16px;border:1px solid rgba(255,255,255,0.06);background:${rowBg};">
        <span style="font-size:13px;font-weight:800;color:${color};">${escH(exam.course)}</span>
        ${info.name?`<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${escH(info.name)}</div>`:''}
      </td>
    </tr>`;
  });

  const dateStr = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  return `<div style="width:860px;background:#0d0d1b;padding:36px;font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;box-sizing:border-box;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;padding-bottom:20px;border-bottom:1.5px solid rgba(124,58,237,0.4);">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="white" stroke-width="2"/><path d="M16 2V6M8 2V6M3 10H21" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M8 14h8M8 17h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <div>
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.02em;">${escH(label)} Exam Routine</div>
          <div style="font-size:13px;color:#a78bfa;font-weight:600;margin-top:4px;">Batch 62, Section B &nbsp;·&nbsp; Spring 2026</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:700;color:#94a3b8;">Leading University, Sylhet</div>
        <div style="font-size:11.5px;color:#4b5563;margin-top:4px;">Department of Computer Science &amp; Engineering</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a78bfa;background:rgba(124,58,237,0.14);border:1px solid rgba(255,255,255,0.07);">DAY</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a78bfa;background:rgba(124,58,237,0.14);border:1px solid rgba(255,255,255,0.07);">DATE</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a78bfa;background:rgba(124,58,237,0.14);border:1px solid rgba(255,255,255,0.07);">TIME</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a78bfa;background:rgba(124,58,237,0.14);border:1px solid rgba(255,255,255,0.07);">COURSE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid rgba(255,255,255,0.05);">
      <div style="font-size:10.5px;color:#374151;font-weight:500;">CSE 62B Portal &nbsp;·&nbsp; cse62b.vercel.app</div>
      <div style="font-size:10.5px;color:#374151;">Generated: ${dateStr}</div>
    </div>
  </div>`;
}

async function downloadExamImage(btn) {
  if (!_examCache) return;
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    wrapper.innerHTML = buildExamPrintTemplate();
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper.firstElementChild, {backgroundColor:'#0d0d1b',scale:3,useCORS:true,logging:false,allowTaint:true});
    document.body.removeChild(wrapper);
    const a = document.createElement('a');
    a.download = `${_examCache.label.replace(' ','-')}-Exam-CSE62B-Spring2026.png`;
    a.href = canvas.toDataURL('image/png'); a.click();
  } catch(e) { alert('Download failed: ' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

async function downloadExamPDF(btn) {
  if (!_examCache) return;
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';
  try {
    await Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    ]);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    wrapper.innerHTML = buildExamPrintTemplate();
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper.firstElementChild, {backgroundColor:'#0d0d1b',scale:3,useCORS:true,logging:false,allowTaint:true});
    document.body.removeChild(wrapper);
    const { jsPDF } = window.jspdf;
    const w = canvas.width/3, h = canvas.height/3;
    const pdf = new jsPDF({orientation: w > h ? 'landscape' : 'portrait', unit:'px', format:[w+20,h+20]});
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, w, h);
    pdf.save(`${_examCache.label.replace(' ','-')}-Exam-CSE62B-Spring2026.pdf`);
  } catch(e) { alert('Download failed: ' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}
