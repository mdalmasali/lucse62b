/* ─── Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, timeToMin, courseColor,
   escH, DAY_DISPLAY, _doDownloadImg, _doDownloadPDF */

const _RT_SUPA = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _RT_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

let _routineCache  = null;
let _improvedCache = null;
let _routineTab    = 'regular';

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

/* ── Build improved cache (62B regular + enrolled courses) ── */
function _buildImprovedCache(enrollments) {
  if (!_routineCache || !enrollments.length) return null;

  /* Clone 62B schedule, tag each slot with source */
  const schedule = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    if (_routineCache.schedule[day]) {
      schedule[day] = _routineCache.schedule[day].map(s => ({ ...s, source: '62b' }));
    }
  });

  /* Append enrolled course slots */
  enrollments.forEach(e => {
    (e.schedule || []).forEach(s => {
      const day = s.day;
      if (!day) return;
      if (!schedule[day]) schedule[day] = [];
      schedule[day].push({
        time:     s.time,
        code:     e.course_code,
        initials: s.initials || e.teacher || '',
        room:     s.room     || '',
        isBreak:  false,
        source:   e.type,       /* 'retake' | 'improve' */
        name:     e.course_name || '',
      });
    });
  });

  /* Rebuild time map */
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

  /* Normalize time strings */
  ROUTINE_DAY_NAMES.forEach(day => {
    (schedule[day] || []).forEach(s => { s.time = timeKeyMap.get(timeToMin(s.time)) || s.time; });
  });

  const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]?.some(s => !s.isBreak));
  return { days, schedule, courseInfo: _routineCache.courseInfo, allTimes, breakTimesSet, semester: _routineCache.semester };
}

/* ── Render one course card inside a grid cell ── */
function _rtRenderSlot(slot, courseInfo) {
  const color   = courseColor(slot.code);
  const info    = courseInfo[slot.code?.toUpperCase()] || {};
  const teacher = info.teacher || slot.initials || '';

  let borderColor = color + '55';
  let badge = '';
  if (slot.source === 'retake') {
    borderColor = 'rgba(244,63,94,.55)';
    badge = `<span style="font-size:0.52rem;font-weight:800;padding:1px 5px;border-radius:4px;
      background:rgba(244,63,94,.2);color:#f43f5e;letter-spacing:0.05em;display:block;margin-top:2px;">
      RETAKE</span>`;
  } else if (slot.source === 'improve') {
    borderColor = 'rgba(251,146,60,.55)';
    badge = `<span style="font-size:0.52rem;font-weight:800;padding:1px 5px;border-radius:4px;
      background:rgba(251,146,60,.2);color:#fb923c;letter-spacing:0.05em;display:block;margin-top:2px;">
      IMPROVE</span>`;
  }

  return `<div class="rt-gc" style="background:${color}12;border-color:${borderColor};margin-bottom:3px;">
    <span class="rt-gc-code" style="color:${color};">${escH(slot.code)}</span>
    ${badge}
    ${teacher ? `<span class="rt-gc-teacher">${escH(teacher)}</span>` : ''}
    ${slot.room ? `<span class="rt-gc-room">${escH(slot.room)}</span>` : ''}
  </div>`;
}

/* ── Build the routine grid HTML ── */
function buildGrid(todayName) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache      = isImproved ? _improvedCache : _routineCache;
  if (!cache) return '';

  const { allTimes, schedule, courseInfo, breakTimesSet } = cache;
  if (!allTimes.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  /* Multi-slot lookup: day → time → [slots] */
  const lookup = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    lookup[day] = {};
    (schedule[day] || []).forEach(s => {
      if (!lookup[day][s.time]) lookup[day][s.time] = [];
      lookup[day][s.time].push(s);
    });
  });

  const captureTitle = isImproved
    ? `Class Routine — Batch 62, Section B + Retake/Improve · ${cache.semester || ''}`
    : `Class Routine — Batch 62, Section B · ${cache.semester || ''}`;

  let html = `<div id="rt-capture" class="rt-capture-area">
    <div class="rt-capture-title">
      <i class="fa-solid fa-calendar-week" style="margin-right:6px;color:var(--accent-bright);"></i>
      ${captureTitle}
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
      const isBreak = breakTimesSet.has(time);
      const allSlots   = daySlots[time] || [];
      const courses    = allSlots.filter(s => !s.isBreak);
      const hasBreakHere = allSlots.some(s => s.isBreak);

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

    _routineCache  = { days, schedule, courseInfo, allTimes, breakTimesSet, semester: sem };
    _improvedCache = null;
    _routineTab    = 'regular';

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];

    body.innerHTML = `
      <div class="rt-sync">
        <div class="rt-sync-dot"></div>
        <span>Live sync · ${sem} · Updated ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
      </div>
      <div id="rt-tab-bar" style="margin-bottom:16px;"></div>
      <div id="rt-main-content">${buildGrid(todayName)}</div>`;

    /* Background: fetch enrollments — show Improved tab if any exist */
    const user = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
    if (user?.id) {
      _rtFetchEnrollments(user.id).then(enrollments => {
        if (!enrollments.length) return;
        _improvedCache = _buildImprovedCache(enrollments);
        if (!_improvedCache) return;

        const tabBar = document.getElementById('rt-tab-bar');
        if (!tabBar) return;
        tabBar.innerHTML = `
          <div style="display:flex;gap:8px;">
            <button class="ri-tab ri-tab-active" onclick="routineSwitchTab('regular')" id="rt-tab-regular">
              <i class="fa-solid fa-calendar-week"></i> Regular
            </button>
            <button class="ri-tab" onclick="routineSwitchTab('improved')" id="rt-tab-improved">
              <i class="fa-solid fa-rotate-right"></i> Improved
              <span class="ri-tab-count">${enrollments.length}</span>
            </button>
          </div>`;
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
  const cache  = isImproved ? _improvedCache : _routineCache;
  const sem    = cache?.semester || 'Routine';
  const slug   = sem.replace(/\s+/g, '');
  const title  = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadImg(`Routine-CSE62B-${slug}.png`, title, `Batch 62, Section B · ${sem}`, cache, null, btn);
}
function downloadRoutinePDF(btn) {
  const isImproved = _routineTab === 'improved' && _improvedCache;
  const cache  = isImproved ? _improvedCache : _routineCache;
  const sem    = cache?.semester || 'Routine';
  const slug   = sem.replace(/\s+/g, '');
  const title  = isImproved ? 'My Improved Routine' : 'Class Routine';
  _doDownloadPDF(`Routine-CSE62B-${slug}.pdf`, title, `Batch 62, Section B · ${sem}`, cache, null, btn);
}
