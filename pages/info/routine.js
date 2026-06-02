/* ─── Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, timeToMin, courseColor,
   escH, DAY_DISPLAY, _doDownloadImg, _doDownloadPDF */

const _RT_SUPA = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _RT_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

let _routineCache      = null;  /* currently displayed cache */
let _62bCache          = null;  /* always the 62B cache, preserved for restore */
let _improvedCache     = null;
let _routineTab        = 'regular';
let _rtLastEnrollments = [];
window._rtExcluded     = new Set();

/* Multi-batch support */
let _allDayResults          = null;
let _allCourseInfo          = {};
let _semLabel               = 'Current Semester';
let _availableBatchSections = [];
let _selectedBatch          = '62';
let _selectedSection        = 'B';

/* ── Excluded courses: localStorage + Supabase ── */
function _rtLocalExcluded(userId) {
  try { return new Set(JSON.parse(localStorage.getItem(`lu62b_excl_${userId}`) || '[]')); }
  catch(e) { return new Set(); }
}

async function _rtSaveExcluded(userId, arr) {
  try { localStorage.setItem(`lu62b_excl_${userId}`, JSON.stringify(arr)); } catch(e) {}
  try {
    await fetch(`${_RT_SUPA}/rest/v1/student_manual_courses`, {
      method: 'POST',
      headers: {
        'apikey': _RT_KEY, 'Authorization': `Bearer ${_RT_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        student_id: userId,
        excluded_courses: arr,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch(e) {}
}

async function _rtLoadExcludedFromSupa(userId) {
  try {
    const r = await fetch(
      `${_RT_SUPA}/rest/v1/student_manual_courses?student_id=eq.${encodeURIComponent(userId)}&select=excluded_courses`,
      { headers: { 'apikey': _RT_KEY, 'Authorization': `Bearer ${_RT_KEY}` } }
    );
    if (!r.ok) return;
    const rows = await r.json();
    if (rows.length && Array.isArray(rows[0].excluded_courses)) {
      window._rtExcluded = new Set(rows[0].excluded_courses);
      try { localStorage.setItem(`lu62b_excl_${userId}`, JSON.stringify(rows[0].excluded_courses)); } catch(e) {}
    }
  } catch(e) {}
}

/* ── Fetch enrolled retake/improve sections ── */
async function _rtFetchEnrollments(userId) {
  try {
    const r = await fetch(
      `${_RT_SUPA}/rest/v1/student_retake_enrollments?student_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { 'apikey': _RT_KEY, 'Authorization': `Bearer ${_RT_KEY}` } }
    );
    return r.ok ? await r.json() : [];
  } catch(e) { return []; }
}

/* ── Build improved cache (62B selected courses + enrolled) ── */
function _buildImprovedCache(enrollments) {
  if (!_62bCache || !enrollments.length) return null;

  const excl = window._rtExcluded;
  const schedule = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    if (_62bCache.schedule[day]) {
      schedule[day] = _62bCache.schedule[day]
        .filter(s => s.isBreak || !excl.has(s.code))
        .map(s => ({ ...s, source: '62b' }));
    }
  });

  enrollments.forEach(e => {
    (e.schedule || []).forEach(s => {
      const day = s.day;
      if (!day) return;
      if (!schedule[day]) schedule[day] = [];
      schedule[day].push({
        time: s.time, code: e.course_code,
        initials: s.initials || e.teacher || '',
        room: s.room || '', isBreak: false, source: e.type,
        name: e.course_name || '',
      });
    });
  });

  const groups = buildTimeframeGroups(schedule, _62bCache.dayTimeframes);
  if (!groups.length) return null;

  const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]?.some(s => !s.isBreak));
  return { days, schedule, courseInfo: _62bCache.courseInfo, groups,
           dayTimeframes: _62bCache.dayTimeframes, semester: _62bCache.semester };
}

/* ── Scan all day results to find unique batch/section combos ── */
function _scanBatchSections(dayResults) {
  const seen   = new Set();
  const combos = [];
  dayResults.forEach(data => {
    if (!data?.table) return;
    const rows = data.table.rows || [];
    const cols = data.table.cols || [];
    let timeSlots = cols.slice(3).map(c => (c.label||'').trim());
    let dataStart = 0;
    if (!timeSlots.some(t => /\d+:\d+/.test(t))) {
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
        if (cells.slice(3).some(c => /\d+:\d+/.test(c))) { dataStart = r + 1; break; }
      }
    }
    for (let r = dataStart; r < rows.length; r++) {
      const cells   = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
      const batch   = (cells[1]?.trim() || '').replace(/\.0+$/, '');
      const section = cells[2]?.trim()?.toUpperCase();
      if (batch && /^\d+$/.test(batch) && section && /^[A-Z]$/.test(section)) {
        const key = `${batch}-${section}`;
        if (!seen.has(key)) { seen.add(key); combos.push({ batch, section }); }
      }
    }
  });
  return combos.sort((a, b) => {
    const bd = parseInt(b.batch) - parseInt(a.batch);
    return bd !== 0 ? bd : a.section.localeCompare(b.section);
  });
}

/* ── Build a schedule object for any batch/section from stored day results ── */
function _buildScheduleFor(batch, section) {
  const schedule      = {};
  const sheetTimes    = new Map(); /* all time slots from sheet, including empty ones */
  const dayTimeframes = {};        /* dayName → that day's full list of time columns */

  ROUTINE_DAY_NAMES.forEach((dayName, idx) => {
    const data = _allDayResults[idx];
    if (!data?.table) return;
    const rows = data.table.rows || [];
    const cols = data.table.cols || [];
    if (!rows.length) return;

    let timeSlots = cols.slice(3).map(c => (c.label||'').trim());
    let dataStart = 0;
    if (!timeSlots.some(t => /\d+:\d+/.test(t))) {
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
        if (cells.slice(3).some(c => /\d+:\d+/.test(c))) {
          timeSlots = cells.slice(3); dataStart = r + 1; break;
        }
      }
    }

    let breakSlotIdx = -1;
    const targetRows = [];
    for (let r = dataStart; r < rows.length; r++) {
      const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
      cells.slice(3).forEach((cell, i) => { if (cell.toUpperCase() === 'BREAK') breakSlotIdx = i; });
      const rowBatch = String(cells[1]?.trim() || '').replace(/\.0+$/, '');
      if (rowBatch === batch && cells[2]?.trim().toUpperCase() === section) targetRows.push(cells);
    }
    if (!targetRows.length) return;

    const mergedCells = targetRows[0].slice(3).map((_, i) =>
      targetRows.map(r => r.slice(3)[i]).find(v => v && v.toUpperCase() !== 'BREAK') || ''
    );

    const daySchedule = [];
    timeSlots.forEach((time, i) => {
      if (!time) return;
      if (i === breakSlotIdx) { daySchedule.push({ isBreak: true, time }); return; }
      const parsed = parseClassCell(mergedCells[i]);
      if (parsed) daySchedule.push({ time, ...parsed, source: '62b' });
    });

    /* Only collect time slots from days where this section actually has classes */
    if (daySchedule.some(s => !s.isBreak)) {
      schedule[dayName] = daySchedule;
      dayTimeframes[dayName] = timeSlots.filter(t => t && /\d+:\d+/.test(t));
      timeSlots.forEach(t => {
        if (t && /\d+:\d+/.test(t)) {
          const k = timeToMin(t);
          if (!sheetTimes.has(k)) sheetTimes.set(k, t);
        }
      });
    }
  });
  return { schedule, sheetTimes, dayTimeframes };
}

/* ── Build a full cache object from a schedule ── */
function _scheduleToCacheWith(schedule, courseInfo, sem, sheetTimes, dayTimeframes) {
  const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]);
  if (!days.length) return null;

  /* Group days by their timeframe so Friday (different time columns) renders
     under its own header instead of being forced into the Sat–Thu grid. */
  const groups = buildTimeframeGroups(schedule, dayTimeframes);
  if (!groups.length) return null;

  return { days, schedule, courseInfo, groups, dayTimeframes, semester: sem };
}

/* ── Render one course card ── */
function _rtRenderSlot(slot, courseInfo) {
  const color   = courseColor(slot.code);
  const info    = courseInfo[slot.code?.toUpperCase()] || {};
  const teacher = info.teacher || slot.initials || '';
  const name    = info.name || slot.name || '';
  const title   = name || slot.code || '';

  let borderColor = color + '55';
  let badge = '';
  if (slot.source === 'retake') {
    borderColor = 'rgba(244,63,94,.55)';
    badge = `<span style="font-size:0.52rem;font-weight:800;padding:1px 5px;border-radius:4px;
      background:rgba(244,63,94,.2);color:#f43f5e;letter-spacing:0.05em;display:block;margin-top:2px;">RETAKE</span>`;
  } else if (slot.source === 'improve') {
    borderColor = 'rgba(251,146,60,.55)';
    badge = `<span style="font-size:0.52rem;font-weight:800;padding:1px 5px;border-radius:4px;
      background:rgba(251,146,60,.2);color:#fb923c;letter-spacing:0.05em;display:block;margin-top:2px;">IMPROVE</span>`;
  }

  return `<div class="rt-gc" style="background:${color}12;border-color:${borderColor};margin-bottom:3px;">
    <span class="rt-gc-name" style="color:${color};font-weight:800;font-size:0.62rem;line-height:1.22;letter-spacing:0.01em;text-align:center;">${escH(title)}</span>
    ${name ? `<span class="rt-gc-code" style="color:${color};opacity:0.55;font-size:0.5rem;font-weight:700;letter-spacing:0.04em;">${escH(slot.code)}</span>` : ''}
    ${badge}
    ${teacher ? `<span class="rt-gc-teacher">${escH(teacher)}</span>` : ''}
    ${slot.room ? `<span class="rt-gc-room">${escH(slot.room)}</span>` : ''}
  </div>`;
}

/* ── Build the routine grid ── */
function buildGrid(todayName) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache      = isImproved ? _improvedCache : _routineCache;
  if (!cache) return '';

  const { schedule, courseInfo, groups } = cache;
  if (!groups || !groups.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  const excl  = window._rtExcluded;
  const is62b = _selectedBatch === '62' && _selectedSection === 'B';
  const batchLabel   = `Batch ${_selectedBatch}, Section ${_selectedSection}`;
  const captureTitle = isImproved
    ? `Class Routine — ${batchLabel} + Retake/Improve · ${cache.semester || ''}`
    : `Class Routine — ${batchLabel} · ${cache.semester || ''}`;

  /* One table per timeframe group (Sat–Thu, then a separate Friday if its
     time columns differ), rendered back-to-back inside one wrap. */
  const renderCourses = courses => courses
    .filter(s => (!isImproved && is62b ? !excl.has(s.code) : true))
    .map(s => _rtRenderSlot(s, courseInfo))
    .join('');

  const tables = groups.map((g, gi) => routineTableHTML(g, schedule, todayName, renderCourses, gi)).join('');

  let html = `<div id="rt-capture" class="rt-capture-area">
    <div class="rt-capture-title">
      <i class="fa-solid fa-calendar-week" style="margin-right:6px;color:var(--accent-bright);"></i>${captureTitle}
    </div>
    <div class="rt-grid-wrap">${tables}</div></div>
  <div class="rt-dl-bar">
    <button class="rt-dl-btn" onclick="downloadRoutineImage(this)">
      <i class="fa-solid fa-image"></i> Image Download
    </button>
    <button class="rt-dl-btn rt-dl-btn-pdf" onclick="downloadRoutinePDF(this)">
      <i class="fa-solid fa-file-pdf"></i> PDF Download
    </button>
  </div>`;

  return html;
}

/* ── Tab switch ── */
window.routineSwitchTab = function(tab) {
  _routineTab = tab;
  document.querySelectorAll('#rt-tab-bar .ri-tab').forEach(t => t.classList.remove('ri-tab-active'));
  document.getElementById(`rt-tab-${tab}`)?.classList.add('ri-tab-active');
  const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];
  const el = document.getElementById('rt-main-content');
  if (el) el.innerHTML = buildGrid(todayName);
};

/* ── Batch/section selector: update section options when batch changes ── */
window._rtOnBatchChange = function() {
  const batchSel   = document.getElementById('rt-batch-select');
  const sectionSel = document.getElementById('rt-section-select');
  if (!batchSel || !sectionSel) return;
  const batch = batchSel.value;
  const sections = _availableBatchSections
    .filter(c => c.batch === batch)
    .map(c => c.section);
  const prevSection = sectionSel.value;
  sectionSel.innerHTML = sections.map(s =>
    `<option value="${s}"${s === prevSection ? ' selected' : ''}>${s}</option>`
  ).join('');
  if (!sections.includes(prevSection) && sections.length) sectionSel.value = sections[0];
  window._rtApplyBatchSection();
};

/* ── Switch to selected batch/section ── */
window._rtApplyBatchSection = function() {
  const batch   = document.getElementById('rt-batch-select')?.value;
  const section = document.getElementById('rt-section-select')?.value;
  if (!batch || !section) return;
  if (batch === _selectedBatch && section === _selectedSection) return;

  _selectedBatch   = batch;
  _selectedSection = section;
  const is62b      = batch === '62' && section === 'B';
  const todayName  = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];

  if (is62b) {
    /* Restore the 62B cache */
    _routineCache  = _62bCache;
    _routineTab    = 'regular';
    _improvedCache = null;

    /* Rebuild Improved cache if enrollments are available */
    if (_rtLastEnrollments.length) {
      _improvedCache = _buildImprovedCache(_rtLastEnrollments);
    }
  } else {
    /* Build a fresh cache for the selected batch/section */
    const { schedule, sheetTimes, dayTimeframes } = _buildScheduleFor(batch, section);
    const newCache = _scheduleToCacheWith(schedule, _allCourseInfo, _semLabel, sheetTimes, dayTimeframes);
    if (!newCache) {
      const el = document.getElementById('rt-main-content');
      if (el) el.innerHTML = `<div class="rt-grid-empty-msg">No schedule found for Batch ${escH(batch)}, Section ${escH(section)}.</div>`;
      return;
    }
    _routineCache  = newCache;
    _routineTab    = 'regular';
    _improvedCache = null;
  }

  /* Show/hide 62B-only controls */
  const user   = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
  const tabBar = document.getElementById('rt-tab-bar');
  const myCoursesBtn = document.getElementById('rt-my-courses-btn');

  if (is62b) {
    if (myCoursesBtn) myCoursesBtn.style.display = '';
    if (tabBar && _improvedCache && _rtLastEnrollments.length) {
      tabBar.innerHTML = `
        <div style="display:flex;gap:8px;">
          <button class="ri-tab" onclick="routineSwitchTab('regular')" id="rt-tab-regular">
            <i class="fa-solid fa-calendar-week"></i> Regular
          </button>
          <button class="ri-tab ri-tab-active" onclick="routineSwitchTab('improved')" id="rt-tab-improved">
            <i class="fa-solid fa-rotate-right"></i> Improved
            <span class="ri-tab-count">${_rtLastEnrollments.length}</span>
          </button>
        </div>`;
      _routineTab = 'improved';
    }
  } else {
    if (myCoursesBtn) myCoursesBtn.style.display = 'none';
    if (tabBar) tabBar.innerHTML = '';
  }

  const el = document.getElementById('rt-main-content');
  if (el) el.innerHTML = buildGrid(todayName);
};

/* ── Render the batch/section selector bar ── */
function _renderSelectorBar() {
  const batches  = [...new Set(_availableBatchSections.map(c => c.batch))];
  const sections = _availableBatchSections
    .filter(c => c.batch === '62')
    .map(c => c.section);

  const batchOpts   = batches.map(b => `<option value="${b}"${b === '62' ? ' selected' : ''}>${b}</option>`).join('');
  const sectionOpts = sections.map(s => `<option value="${s}"${s === 'B' ? ' selected' : ''}>${s}</option>`).join('');

  return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;
      padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:12px;">
      <i class="fa-solid fa-magnifying-glass" style="color:var(--accent-bright);font-size:0.8rem;"></i>
      <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Batch</span>
      <select id="rt-batch-select" onchange="_rtOnBatchChange()"
        style="font-size:0.78rem;font-weight:700;color:var(--text);background:var(--bg);
          border:1px solid var(--border);border-radius:8px;padding:4px 8px;cursor:pointer;
          font-family:'Inter',sans-serif;outline:none;">
        ${batchOpts}
      </select>
      <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Section</span>
      <select id="rt-section-select" onchange="_rtApplyBatchSection()"
        style="font-size:0.78rem;font-weight:700;color:var(--text);background:var(--bg);
          border:1px solid var(--border);border-radius:8px;padding:4px 8px;cursor:pointer;
          font-family:'Inter',sans-serif;outline:none;">
        ${sectionOpts}
      </select>
      <span style="font-size:0.7rem;color:var(--text-secondary);margin-left:2px;">
        — other batches' routines available
      </span>
    </div>`;
}

/* ── My Courses modal ── */
window._rtOpenMyCourses = function() {
  const existing = document.getElementById('rt-my-courses-panel');
  if (existing) { existing.remove(); return; }
  if (!_62bCache) return;

  const allCodes = new Map();
  Object.values(_62bCache.schedule).forEach(slots => {
    slots.forEach(s => {
      if (!s.isBreak && s.code) {
        allCodes.set(s.code, _62bCache.courseInfo[s.code]?.name || '');
      }
    });
  });

  const panel = document.createElement('div');
  panel.id = 'rt-my-courses-panel';
  panel.style.cssText = `background:var(--card);border:1px solid var(--border);border-radius:14px;
    padding:18px;margin-bottom:14px;`;

  const items = [...allCodes.entries()].sort(([a], [b]) => a.localeCompare(b));
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:0.82rem;font-weight:700;color:var(--text);">
        <i class="fa-solid fa-pen-to-square" style="color:var(--accent-bright);margin-right:6px;font-size:0.75rem;"></i>
        My 62B Courses This Semester
      </span>
      <button onclick="document.getElementById('rt-my-courses-panel').remove()"
        style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.9rem;">✕</button>
    </div>
    <p style="font-size:0.7rem;color:var(--text-secondary);margin:0 0 14px;line-height:1.6;">
      <strong>Uncheck courses you are NOT taking</strong> this semester. This removes false clash warnings in Retake &amp; Improve and hides those courses from your Improved routine.
    </p>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
      ${items.map(([code, name]) => `
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;
          border-radius:9px;border:1px solid var(--border);background:rgba(255,255,255,.025);
          transition:background .12s;" onmouseover="this.style.background='rgba(99,102,241,.08)'"
          onmouseout="this.style.background='rgba(255,255,255,.025)'">
          <input type="checkbox" class="rt-mc-chk" value="${escH(code)}"
            ${!window._rtExcluded.has(code) ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:#6366f1;cursor:pointer;flex-shrink:0;">
          <span style="font-family:monospace;font-size:0.78rem;font-weight:800;color:var(--accent-bright);">${escH(code)}</span>
          ${name ? `<span style="font-size:0.75rem;color:var(--text-secondary);">${escH(name)}</span>` : ''}
        </label>`).join('')}
    </div>
    <button onclick="_rtSaveMyCourses()"
      style="width:100%;padding:9px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
      color:#fff;font-weight:700;font-size:0.82rem;border:none;cursor:pointer;font-family:'Inter',sans-serif;">
      <i class="fa-solid fa-check"></i> Save My Courses
    </button>`;

  const mainContent = document.getElementById('rt-main-content');
  mainContent?.parentNode.insertBefore(panel, mainContent);
};

window._rtSaveMyCourses = async function() {
  const excluded = [];
  document.querySelectorAll('.rt-mc-chk').forEach(cb => { if (!cb.checked) excluded.push(cb.value); });
  window._rtExcluded = new Set(excluded);

  const user = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
  if (user?.id) _rtSaveExcluded(user.id, excluded);

  document.getElementById('rt-my-courses-panel')?.remove();

  if (_rtLastEnrollments.length) _improvedCache = _buildImprovedCache(_rtLastEnrollments);

  const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];
  const el = document.getElementById('rt-main-content');
  if (el) el.innerHTML = buildGrid(todayName);
};

/* ── Main loader ── */
async function loadRoutine(body) {
  try {
    const [routineSheetId, sem] = await Promise.all([getRoutineSheetId(), getSemesterLabel()]);
    _semLabel = sem;

    const cpgFetch   = fetchSheet('CPG_Courses').catch(() => null);
    const dayFetches = ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null));
    const [cpgData, ...dayResults] = await Promise.all([cpgFetch, ...dayFetches]);

    /* Store globally for re-use when switching batch/section */
    _allDayResults = dayResults;

    const courseInfo = {};
    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[1] && !['code','title','course'].includes(r[1].toLowerCase()))
        .forEach(r => {
          courseInfo[r[1].trim().toUpperCase()] = {
            name:    r[0]?.trim() || '',
            teacher: r[4]?.trim() || '',
            desig:   r[5]?.trim() || '',
          };
        });
    }
    _allCourseInfo = courseInfo;

    /* Scan all available batch/section combos */
    _availableBatchSections = _scanBatchSections(dayResults);

    /* Build 62B schedule */
    const { schedule, sheetTimes, dayTimeframes } = _buildScheduleFor('62', 'B');
    const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]);
    if (!days.length) throw new Error('No classes found for Batch 62, Section B');

    const cache62b = _scheduleToCacheWith(schedule, courseInfo, sem, sheetTimes, dayTimeframes);
    if (!cache62b) throw new Error('No classes found for Batch 62, Section B');

    _62bCache      = cache62b;
    _routineCache  = cache62b;
    _improvedCache = null;
    _rtLastEnrollments = [];
    _routineTab    = 'regular';
    _selectedBatch = '62';
    _selectedSection = 'B';

    /* Load excluded courses from localStorage immediately */
    const user = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
    if (user?.id) {
      /* Save full 62B course list for profile's My Courses card */
      try {
        const codeMap = new Map();
        Object.values(schedule).forEach(slots =>
          slots.forEach(s => { if (!s.isBreak && s.code) codeMap.set(s.code, courseInfo[s.code]?.name || ''); })
        );
        localStorage.setItem(
          `lu62b_62bcourses_${user.id}`,
          JSON.stringify(Array.from(codeMap.entries()).map(([code, name]) => ({ code, name })))
        );
      } catch(e) {}

      window._rtExcluded = _rtLocalExcluded(user.id);
      _rtLoadExcludedFromSupa(user.id).then(() => {
        const el = document.getElementById('rt-main-content');
        if (el) el.innerHTML = buildGrid(todayName);
      });
    }

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];

    body.innerHTML = `
      ${_availableBatchSections.length > 1 ? _renderSelectorBar() : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div class="rt-sync" style="margin:0;">
          <div class="rt-sync-dot"></div>
          <span>Live sync · ${sem} · Updated ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
        </div>
        ${user?.id ? `<button id="rt-my-courses-btn" onclick="_rtOpenMyCourses()"
          style="font-size:0.72rem;color:var(--text-secondary);background:rgba(255,255,255,.05);
          border:1px solid var(--border);border-radius:8px;padding:5px 11px;cursor:pointer;
          font-family:'Inter',sans-serif;display:flex;align-items:center;gap:5px;">
          <i class="fa-solid fa-pen-to-square" style="font-size:0.62rem;"></i> My Courses
        </button>` : ''}
      </div>
      <div id="rt-tab-bar" style="margin-bottom:16px;"></div>
      <div id="rt-main-content">${buildGrid(todayName)}</div>`;

    /* Background: fetch enrollments — show Improved tab if any */
    if (user?.id) {
      _rtFetchEnrollments(user.id).then(enrollments => {
        if (!enrollments.length) return;
        _rtLastEnrollments = enrollments;
        _improvedCache = _buildImprovedCache(enrollments);
        if (!_improvedCache) return;

        /* Only show Improved tab if still on 62B */
        if (_selectedBatch !== '62' || _selectedSection !== 'B') return;

        const tabBar = document.getElementById('rt-tab-bar');
        if (!tabBar) return;

        _routineTab = 'improved';

        tabBar.innerHTML = `
          <div style="display:flex;gap:8px;">
            <button class="ri-tab" onclick="routineSwitchTab('regular')" id="rt-tab-regular">
              <i class="fa-solid fa-calendar-week"></i> Regular
            </button>
            <button class="ri-tab ri-tab-active" onclick="routineSwitchTab('improved')" id="rt-tab-improved">
              <i class="fa-solid fa-rotate-right"></i> Improved
              <span class="ri-tab-count">${enrollments.length}</span>
            </button>
          </div>`;

        const mainContent = document.getElementById('rt-main-content');
        if (mainContent) mainContent.innerHTML = buildGrid(todayName);
      });
    }

  } catch(e) {
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load routine.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${e.message}</p>
    </div>`;
  }
}

function downloadRoutineImage(btn) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache = isImproved ? _improvedCache : _routineCache;
  const sem   = cache?.semester || 'Routine';
  const slug  = sem.replace(/\s+/g, '');
  const batchLabel = `Batch ${_selectedBatch}, Section ${_selectedSection}`;
  const title = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadImg(`Routine-CSE${_selectedBatch}${_selectedSection}-${slug}.png`, title, `${batchLabel} · ${sem}`, cache, null, btn);
}
function downloadRoutinePDF(btn) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache = isImproved ? _improvedCache : _routineCache;
  const sem   = cache?.semester || 'Routine';
  const slug  = sem.replace(/\s+/g, '');
  const batchLabel = `Batch ${_selectedBatch}, Section ${_selectedSection}`;
  const title = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadPDF(`Routine-CSE${_selectedBatch}${_selectedSection}-${slug}.pdf`, title, `${batchLabel} · ${sem}`, cache, null, btn);
}
