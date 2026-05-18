/* ─── Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, timeToMin, courseColor,
   escH, DAY_DISPLAY, _doDownloadImg, _doDownloadPDF */

const _RT_SUPA = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _RT_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

let _routineCache     = null;
let _improvedCache    = null;
let _routineTab       = 'regular';
let _rtLastEnrollments = [];
window._rtExcluded    = new Set(); /* shared — also read by retake-improve.js */

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
  if (!_routineCache || !enrollments.length) return null;

  const excl = window._rtExcluded;
  const schedule = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    if (_routineCache.schedule[day]) {
      schedule[day] = _routineCache.schedule[day]
        .filter(s => s.isBreak || !excl.has(s.code))  /* skip excluded 62B courses */
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

  const timeKeyMap    = new Map();
  const breakTimeKeys = new Set();
  Object.values(schedule).forEach(slots => {
    slots.forEach(s => {
      const k = timeToMin(s.time);
      if (!timeKeyMap.has(k)) timeKeyMap.set(k, s.time);
      if (s.isBreak) breakTimeKeys.add(k);
    });
  });
  const sortedKeys    = [...timeKeyMap.keys()].sort((a, b) => a - b);
  const allTimes      = sortedKeys.map(k => timeKeyMap.get(k));
  const breakTimesSet = new Set(sortedKeys.filter(k => breakTimeKeys.has(k)).map(k => timeKeyMap.get(k)));

  ROUTINE_DAY_NAMES.forEach(day => {
    (schedule[day] || []).forEach(s => { s.time = timeKeyMap.get(timeToMin(s.time)) || s.time; });
  });

  const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]?.some(s => !s.isBreak));
  return { days, schedule, courseInfo: _routineCache.courseInfo, allTimes, breakTimesSet, semester: _routineCache.semester };
}

/* ── Render one course card ── */
function _rtRenderSlot(slot, courseInfo) {
  const color   = courseColor(slot.code);
  const info    = courseInfo[slot.code?.toUpperCase()] || {};
  const teacher = info.teacher || slot.initials || '';

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
    <span class="rt-gc-code" style="color:${color};">${escH(slot.code)}</span>
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

  const { allTimes, schedule, courseInfo, breakTimesSet } = cache;
  if (!allTimes.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  const lookup = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    lookup[day] = {};
    (schedule[day] || []).forEach(s => {
      if (!lookup[day][s.time]) lookup[day][s.time] = [];
      lookup[day][s.time].push(s);
    });
  });

  const excl = window._rtExcluded;
  const captureTitle = isImproved
    ? `Class Routine — Batch 62, Section B + Retake/Improve · ${cache.semester || ''}`
    : `Class Routine — Batch 62, Section B · ${cache.semester || ''}`;

  let html = `<div id="rt-capture" class="rt-capture-area">
    <div class="rt-capture-title">
      <i class="fa-solid fa-calendar-week" style="margin-right:6px;color:var(--accent-bright);"></i>${captureTitle}
    </div>
    <div class="rt-grid-wrap"><table class="rt-grid"><thead><tr>
    <th class="rt-th-day">Day</th>`;

  allTimes.forEach(time => {
    const isBreak = breakTimesSet.has(time);
    html += `<th${isBreak ? ' class="rt-th-break"' : ''}>${escH(time)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  ROUTINE_DAY_NAMES.forEach(day => {
    const daySlots = lookup[day] || {};
    const hasClass = schedule[day]?.some(s => !s.isBreak);
    const isToday  = day === todayName;

    html += `<tr class="${hasClass ? 'has-class' : 'no-class'}">
      <td class="rt-grid-day-cell">${escH(DAY_DISPLAY[day] || day)}${isToday
        ? ' <span style="font-size:0.58rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;">Today</span>'
        : ''}</td>`;

    allTimes.forEach(time => {
      const isBreak  = breakTimesSet.has(time);
      const allSlots = daySlots[time] || [];
      const hasBreakHere = allSlots.some(s => s.isBreak);

      /* In regular tab, hide excluded 62B courses (show as free) */
      const courses = allSlots.filter(s =>
        !s.isBreak && (!isImproved ? !excl.has(s.code) : true)
      );

      if (isBreak) {
        html += `<td class="rt-grid-break-cell">${hasBreakHere ? '&#9749; Break' : ''}</td>`;
      } else if (!courses.length) {
        html += `<td><span class="rt-grid-free">—</span></td>`;
      } else {
        html += `<td>${courses.map(s => _rtRenderSlot(s, courseInfo)).join('')}</td>`;
      }
    });

    html += `</tr>`;
  });

  html += `</tbody></table></div></div>
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

/* ── My Courses modal ── */
window._rtOpenMyCourses = function() {
  const existing = document.getElementById('rt-my-courses-panel');
  if (existing) { existing.remove(); return; }
  if (!_routineCache) return;

  const allCodes = new Map();
  Object.values(_routineCache.schedule).forEach(slots => {
    slots.forEach(s => {
      if (!s.isBreak && s.code) {
        allCodes.set(s.code, _routineCache.courseInfo[s.code]?.name || '');
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

  /* Rebuild improved cache with updated exclusions */
  if (_rtLastEnrollments.length) _improvedCache = _buildImprovedCache(_rtLastEnrollments);

  /* Re-render current tab */
  const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];
  const el = document.getElementById('rt-main-content');
  if (el) el.innerHTML = buildGrid(todayName);
};

/* ── Main loader ── */
async function loadRoutine(body) {
  try {
    const [routineSheetId, sem] = await Promise.all([getRoutineSheetId(), getSemesterLabel()]);

    const cpgFetch   = fetchSheet('CPG_Courses').catch(() => null);
    const dayFetches = ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null));
    const [cpgData, ...dayResults] = await Promise.all([cpgFetch, ...dayFetches]);

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

    const schedule = {};
    ROUTINE_DAY_NAMES.forEach((dayName, idx) => {
      const data = dayResults[idx];
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
        if (cells[1] === '62' && cells[2] === 'B') targetRows.push(cells);
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
      if (daySchedule.some(s => !s.isBreak)) schedule[dayName] = daySchedule;
    });

    const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]);
    if (!days.length) throw new Error('No classes found for Batch 62, Section B');

    const timeKeyMap    = new Map();
    const breakTimeKeys = new Set();
    Object.values(schedule).forEach(slots => {
      slots.forEach(s => {
        const k = timeToMin(s.time);
        if (!timeKeyMap.has(k)) timeKeyMap.set(k, s.time);
        if (s.isBreak) breakTimeKeys.add(k);
      });
    });
    const sortedKeys    = [...timeKeyMap.keys()].sort((a, b) => a - b);
    const allTimes      = sortedKeys.map(k => timeKeyMap.get(k));
    const breakTimesSet = new Set(sortedKeys.filter(k => breakTimeKeys.has(k)).map(k => timeKeyMap.get(k)));

    ROUTINE_DAY_NAMES.forEach(day => {
      (schedule[day] || []).forEach(s => { s.time = timeKeyMap.get(timeToMin(s.time)) || s.time; });
    });

    _routineCache      = { days, schedule, courseInfo, allTimes, breakTimesSet, semester: sem };
    _improvedCache     = null;
    _rtLastEnrollments = [];
    _routineTab        = 'regular';

    /* Load excluded courses from localStorage immediately */
    const user = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
    if (user?.id) {
      window._rtExcluded = _rtLocalExcluded(user.id);
      /* Sync from Supabase in background */
      _rtLoadExcludedFromSupa(user.id).then(() => {
        const el = document.getElementById('rt-main-content');
        if (el) el.innerHTML = buildGrid(todayName);
      });
    }

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div class="rt-sync" style="margin:0;">
          <div class="rt-sync-dot"></div>
          <span>Live sync · ${sem} · Updated ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
        </div>
        ${user?.id ? `<button onclick="_rtOpenMyCourses()"
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

        const tabBar = document.getElementById('rt-tab-bar');
        if (!tabBar) return;

        /* Default to Improved tab since the student has enrollments */
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

        /* Re-render grid with improved data */
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
  const title = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadImg(`Routine-CSE62B-${slug}.png`, title, `Batch 62, Section B · ${sem}`, cache, null, btn);
}
function downloadRoutinePDF(btn) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache = isImproved ? _improvedCache : _routineCache;
  const sem   = cache?.semester || 'Routine';
  const slug  = sem.replace(/\s+/g, '');
  const title = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadPDF(`Routine-CSE62B-${slug}.pdf`, title, `Batch 62, Section B · ${sem}`, cache, null, btn);
}
