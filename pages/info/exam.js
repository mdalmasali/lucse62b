/* ─── Exam Routine (Fixed) ─── */

let _examCache = null;

function fetchExamTab(sheetId) {
  return fetchSheetById(sheetId);
}

function normExamDate(raw) {
  if (!raw) return '';

  // Excel serial number (e.g. 46026, 46057...)
  const num = parseFloat(String(raw).trim());
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return `${String(utc.getDate()).padStart(2,'0')}-${String(utc.getMonth()+1).padStart(2,'0')}-${utc.getFullYear()}`;
  }

  // Google Sheets Date(...) format
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

  // ── If Day-N labels live in GVIZ column headers (not data rows), inject a synthetic row ──
  // This happens when the sheet's first row is the column header row consumed by GVIZ
  const colLabels = (table.cols || []).map(c => String(c.label || '').trim());
  if (colLabels.some(l => /day[\s\-]*\d+/i.test(l))) {
    const synRow = colLabels.map(l => {
      const m = l.match(/day[\s\-]*(\d+)/i);
      return m ? `Day-${m[1]}` : '';
    });
    allRows.unshift(synRow);
  }

  // ── Step 1: Find ALL "Day" header rows ──
  const blockStarts = [];
  for (let r = 0; r < allRows.length; r++) {
    for (let c = 0; c < allRows[r].length; c++) {
      if (/^\s*day[\s\-]*\d+\s*$/i.test(allRows[r][c])) {
        blockStarts.push({ rowIdx: r, colIdx: c });
        break;
      }
    }
  }
  if (blockStarts.length === 0) return null;

  // ── Step 2: Find Batch and Section columns globally ──
  let batchCol = 0;
  let sectionCol = 1;
  for (let r = 0; r < Math.min(allRows.length, 15); r++) {
    const row = allRows[r] || [];
    row.forEach((cell, i) => {
      if (/^\s*batch\s*$/i.test(cell))   batchCol = i;
      if (/^\s*section\s*$/i.test(cell)) sectionCol = i;
    });
  }

  const tbNum = String(targetBatch).replace(/[^0-9]/g, '');
  const tsStr = String(targetSection).trim().toUpperCase();
  const allExams = [];

  // ── Step 3: Parse each block independently ──
  blockStarts.forEach((block, blockIdx) => {
    const dayHeaderIdx = block.rowIdx;

    const nextBlockRow = blockStarts[blockIdx + 1]
      ? blockStarts[blockIdx + 1].rowIdx
      : allRows.length;

    // ── Per-block batch pre-fill (শুধু numeric value track করো) ──
    const rowBatches = {};
    let lastBatch = '';
    for (let r = dayHeaderIdx; r < nextBlockRow; r++) {
      const batchCell = String(allRows[r][batchCol] || '').trim();
      if (batchCell && /\d/.test(batchCell) && !/^(date|time|day|section)/i.test(batchCell)) {
        lastBatch = batchCell;
      }
      rowBatches[r] = lastBatch;
    }

    const dayRow = allRows[dayHeaderIdx] || [];
    const dayCols = dayRow.reduce((a, cell, i) => {
      if (/^\s*day[\s\-]*\d+\s*$/i.test(cell)) a.push(i);
      return a;
    }, []);

    let dateRowIdx    = dayHeaderIdx + 1;
    let timeRowIdx    = dayHeaderIdx + 2;
    let weekdayRowIdx = dayHeaderIdx + 3;

    if (dayCols.length > 0) {
      const sampleCol = dayCols[0];
      for (let i = 1; i <= 5; i++) {
        const rIdx = dayHeaderIdx + i;
        if (rIdx >= allRows.length || rIdx >= nextBlockRow) break;
        const cell = String(allRows[rIdx][sampleCol]).trim();
        if (/Date\(/i.test(cell) || /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(cell)) {
          dateRowIdx = rIdx;
        } else if (/\d{1,2}:\d{2}/.test(cell) || /am|pm/i.test(cell)) {
          timeRowIdx = rIdx;
        } else if (/^(sun|mon|tue|wed|thu|fri|sat)/i.test(cell)) {
          weekdayRowIdx = rIdx;
        }
      }
    }

    const dataStartRow = Math.max(dayHeaderIdx, dateRowIdx, timeRowIdx, weekdayRowIdx) + 1;

    const dateRow    = allRows[dateRowIdx]    || [];
    const timeRow    = allRows[timeRowIdx]    || [];
    const weekdayRow = allRows[weekdayRowIdx] || [];

    const examDays = dayCols.map(col => ({
      col,
      label:   dayRow[col]    || '',
      date:    dateRow[col]   || '',
      time:    timeRow[col]   || '',
      weekday: weekdayRow[col] || ''
    }));

    for (let r = dataStartRow; r < nextBlockRow; r++) {
      const row = allRows[r];
      if (!row) continue;

      const section = (row[sectionCol] || '').trim();
      if (!section || /^(section|day|date|time)$/i.test(section)) continue;

      const currentBatch = rowBatches[r];
      const cbNum = String(currentBatch).replace(/[^0-9]/g, '');
      const csStr = section.toUpperCase();

      const batchMatch   = cbNum && cbNum === tbNum;
      const sectionMatch = csStr === tsStr ||
        csStr.split(/[+&,]/).map(s => s.trim()).includes(tsStr);

      if (batchMatch && sectionMatch) {
        examDays.forEach(day => {
          const raw    = row[day.col] || '';
          const course = raw.replace(/\s*\(\d+\)\s*/g, '').trim();
          if (course && course !== '--' && course !== '–') {
            allExams.push({ ...day, course });
          }
        });
      }
    }
  });

  if (!allExams.length) return null;

  // ── Sort by date → time ──
  allExams.sort((a, b) => {
    const da = examDateObj(a.date);
    const db = examDateObj(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (da.getTime() !== db.getTime()) return da - db;

    const parseTime = (t) => {
      const m = String(t).match(/(\d+):(\d+)\s*([AP]M)?/i);
      if (!m) return 0;
      let h = parseInt(m[1]), min = parseInt(m[2]), ampm = (m[3]||'').toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      if (!ampm && h < 7) h += 12;
      return h * 60 + min;
    };
    return parseTime(a.time) - parseTime(b.time);
  });

  return allExams;
}

/* ─── UI / Display ─── */

function loadExamRoutine(body, type) {
  const label = type === 'mid' ? 'Mid Term' : 'Final Term';
  const icon  = type === 'mid' ? 'fa-solid fa-calendar-check' : 'fa-solid fa-calendar-xmark';
  const color = type === 'mid' ? '#4ade80' : '#f87171';

  body.innerHTML = `
    <div class="rt-tf-wrap">
      <div class="rt-tf-heading"><i class="fa-solid ${icon}" style="margin-right:6px;color:${color};"></i>Search ${label} Routine</div>
      <div class="rt-tf-row">
        <input type="text" id="examBatchInput" class="rt-tf-input" value="62" placeholder="Batch" style="max-width:120px;" />
        <input type="text" id="examSectionInput" class="rt-tf-input" value="B" placeholder="Section" style="max-width:120px;" />
        <button class="rt-tf-btn" id="examSearchBtn" onclick="doExamSearch('${type}')">
          <i class="fa-solid fa-magnifying-glass"></i> Search
        </button>
      </div>
    </div>
    <div id="examRoutineResult"><div class="info-loading-spin"><div class="spin-sm"></div> Loading default routine...</div></div>`;

  document.getElementById('examBatchInput').addEventListener('keydown',  e => { if (e.key === 'Enter') doExamSearch(type); });
  document.getElementById('examSectionInput').addEventListener('keydown', e => { if (e.key === 'Enter') doExamSearch(type); });

  setTimeout(() => doExamSearch(type), 50);
}

async function doExamSearch(type) {
  const label   = type === 'mid' ? 'Mid Term' : 'Final Term';
  const keyword = type === 'mid' ? 'mid term' : 'final term';
  const resultDiv = document.getElementById('examRoutineResult');
  const btn = document.getElementById('examSearchBtn');

  const targetBatch   = document.getElementById('examBatchInput').value.trim();
  const targetSection = document.getElementById('examSectionInput').value.trim().toUpperCase();

  if (!targetBatch || !targetSection) {
    resultDiv.innerHTML = `<div class="info-placeholder"><p>Please enter both Batch and Section.</p></div>`;
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...'; }
  resultDiv.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Fetching routine...</div>';

  try {
    const sheetId = await getSheetIdFromRoutineTab(keyword);
    if (!sheetId) {
      resultDiv.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-link-slash" style="opacity:0.2;font-size:2rem;display:block;margin-bottom:14px;"></i>
        <p style="font-weight:600;">No ${label} Routine linked yet.</p>
        <p style="font-size:0.78rem;margin-top:8px;opacity:0.65;">In your Routine tab, add a row with<br>
        <strong style="color:var(--accent-bright);">${keyword}</strong> in col A and the Google Sheet URL in col B.</p>
      </div>`;
      return;
    }

    const [cpgData, examData, sem] = await Promise.all([
      fetchSheet('CPG_Courses').catch(() => null),
      fetchExamTab(sheetId),
      getSemesterLabel()
    ]);

    const courseInfo = {};
    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[1] && !['code','title','course'].includes(r[1].toLowerCase()))
        .forEach(r => { courseInfo[r[1].trim().toUpperCase()] = { name: r[0].trim() }; });
    }

    const exams = parseExamRoutine(examData, targetBatch, targetSection);
    if (!exams || !exams.length) {
      resultDiv.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-calendar-xmark" style="opacity:0.2;font-size:2rem;display:block;margin-bottom:14px;"></i>
        <p>No exams found for Batch <strong style="color:var(--text);">${escH(targetBatch)}</strong>, Section <strong style="color:var(--text);">${escH(targetSection)}</strong>.</p>
        <p style="font-size:0.75rem;margin-top:6px;opacity:0.65;">Make sure your sheet has "Day 1", "Batch", and "Section" columns matching LU standard format.</p>
      </div>`;
      return;
    }

    _examCache = { type, label, exams, courseInfo, targetBatch, targetSection, semester: sem };

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

    resultDiv.innerHTML = `
      <div class="rt-sync">
        <div class="rt-sync-dot"></div>
        <span>${label} Exam Routine &nbsp;·&nbsp; Batch ${escH(targetBatch)}, Section ${escH(targetSection)} &nbsp;·&nbsp; ${sem}</span>
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
    resultDiv.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load ${label} routine.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${e.message}</p>
    </div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Search'; }
  }
}

/* ─── Print / Download ─── */

function buildExamPrintTemplate() {
  if (!_examCache) return '';
  const { label, exams, courseInfo, targetBatch, targetSection } = _examCache;
  const today = new Date(); today.setHours(0,0,0,0);
  const t = getPrintTheme();

  let rows = '';
  exams.forEach((exam, ri) => {
    const color  = courseColor(exam.course);
    const info   = courseInfo[exam.course.toUpperCase()] || {};
    const dObj   = examDateObj(exam.date);
    const isPast = dObj && dObj < today;
    const rowBg  = ri % 2 === 0 ? t.rowEven : t.rowOdd;
    rows += `<tr style="opacity:${isPast?0.85:1};">
      <td style="padding:11px 16px;text-align:center;font-size:11px;font-weight:700;color:${t.examDay};border:1px solid ${t.borderSub};background:${rowBg};white-space:nowrap;">${escH(exam.label)}</td>
      <td style="padding:11px 16px;font-size:12px;color:${t.examDate};border:1px solid ${t.borderSub};background:${rowBg};white-space:nowrap;">${escH(exam.weekday)}, ${escH(fmtExamDate(exam.date))}</td>
      <td style="padding:11px 16px;font-size:12px;color:${t.examTime};font-weight:600;border:1px solid ${t.borderSub};background:${rowBg};white-space:nowrap;">${escH(exam.time)}</td>
      <td style="padding:11px 16px;border:1px solid ${t.borderSub};background:${rowBg};">
        <span style="font-size:13px;font-weight:800;color:${color};">${escH(exam.course)}</span>
        ${info.name?`<div style="font-size:10px;color:${t.textMuted};margin-top:2px;">${escH(info.name)}</div>`:''}
      </td>
    </tr>`;
  });

  const dateStr = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  return `<div style="width:860px;background:${t.bg};padding:36px;font-family:'Inter',system-ui,sans-serif;color:${t.text};box-sizing:border-box;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;padding-bottom:20px;border-bottom:1.5px solid ${t.divider};">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="white" stroke-width="2"/><path d="M16 2V6M8 2V6M3 10H21" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M8 14h8M8 17h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <div>
          <div style="font-size:22px;font-weight:800;color:${t.text};letter-spacing:-0.02em;">${escH(label)} Exam Routine</div>
          <div style="font-size:13px;color:#a78bfa;font-weight:600;margin-top:4px;">Batch ${escH(targetBatch)}, Section ${escH(targetSection)} &nbsp;·&nbsp; ${_examCache?.semester || ''}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:700;color:${t.univText};">Leading University, Sylhet</div>
        <div style="font-size:11.5px;color:${t.univFaint};margin-top:4px;">Department of Computer Science &amp; Engineering</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.headerText};background:${t.headerBg};border:1px solid ${t.border};">DAY</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.headerText};background:${t.headerBg};border:1px solid ${t.border};">DATE</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.headerText};background:${t.headerBg};border:1px solid ${t.border};">TIME</th>
        <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.headerText};background:${t.headerBg};border:1px solid ${t.border};">COURSE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid ${t.borderSub};">
      <div style="font-size:10.5px;color:${t.footer};font-weight:500;">CSE 62B Portal &nbsp;·&nbsp; lucse62b.xyz</div>
      <div style="font-size:10.5px;color:${t.footer};">Generated: ${dateStr}</div>
    </div>
  </div>`;
}

async function downloadExamImage(btn) {
  if (!_examCache) return;
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const t = getPrintTheme();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    wrapper.innerHTML = buildExamPrintTemplate();
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper.firstElementChild, {backgroundColor:t.bg,scale:3,useCORS:true,logging:false,allowTaint:true});
    document.body.removeChild(wrapper);
    const a = document.createElement('a');
    const slug = (_examCache.semester || 'Exam').replace(/\s+/g, '');
    a.download = `${_examCache.label.replace(' ','-')}-Exam-CSE62B-${slug}.png`;
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
    const t = getPrintTheme();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    wrapper.innerHTML = buildExamPrintTemplate();
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper.firstElementChild, {backgroundColor:t.bg,scale:3,useCORS:true,logging:false,allowTaint:true});
    document.body.removeChild(wrapper);
    const { jsPDF } = window.jspdf;
    const w = canvas.width/3, h = canvas.height/3;
    const pdf = new jsPDF({orientation: w > h ? 'landscape' : 'portrait', unit:'px', format:[w+20,h+20]});
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, w, h);
    const slug = (_examCache.semester || 'Exam').replace(/\s+/g, '');
    pdf.save(`${_examCache.label.replace(' ','-')}-Exam-CSE62B-${slug}.pdf`);
  } catch(e) { alert('Download failed: ' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}