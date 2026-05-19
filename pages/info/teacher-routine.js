/* ─── Teacher Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, parseDayResults,
   deduplicateTimes, courseColor, escH, DAY_DISPLAY,
   _doDownloadImg, _doDownloadPDF */

let _teacherCache  = null;
let _trInitialsMap = {};   /* initials (upper) → full name */
let _trNameMap     = {};   /* normalised full name → initials */
let _trCourseInfo  = null; /* cached CPG_Courses */
let _trDayResults  = null; /* cached day tab results */
let _trSheetId     = null; /* cached routine sheet id */
let _trDataLoaded  = false;

/* ── UI entry point ── */
function loadTeacherRoutine(body) {
  body.innerHTML = `
    <div class="rt-tf-wrap">
      <div class="rt-tf-heading">
        <i class="fa-solid fa-chalkboard-user" style="margin-right:6px;color:#34d399;"></i>
        Search Teacher Routine
      </div>
      <div class="rt-tf-row">
        <input type="text" id="teacherInitialsInput" class="rt-tf-input"
          list="tr-teacher-datalist"
          placeholder="Initials or Name — e.g. NJN, Md. Arif"
          maxlength="80" style="min-width:220px;" />
        <datalist id="tr-teacher-datalist"></datalist>
        <button class="rt-tf-btn" id="teacherSearchBtn" onclick="doTeacherSearch()">
          <i class="fa-solid fa-magnifying-glass"></i> Generate Routine
        </button>
      </div>
      <div class="rt-tf-hint">
        Type initials <em>(e.g. NJN)</em> or teacher name — autocomplete appears after data loads.
      </div>
    </div>
    <div id="teacherRoutineResult"></div>`;

  document.getElementById('teacherInitialsInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doTeacherSearch();
  });

  /* Load teacher map in background for autocomplete */
  if (!_trDataLoaded) _trLoadTeacherData();
}

/* ── Background: build initials ↔ name maps from CPG_Teachers + populate datalist ── */
async function _trLoadTeacherData() {
  try {
    const [sheetId, teacherData] = await Promise.all([
      getRoutineSheetId(),
      fetchSheet('CPG_Teachers').catch(() => null),
    ]);
    _trSheetId = sheetId;

    const initialsMap = {};  /* acronym → full name */

    if (teacherData) {
      /* CPG_Teachers columns: A=Name, B=Designation, C=Department, D=Acronym */
      sheetRows(teacherData).forEach(r => {
        const name    = (r[0] || '').trim();
        const acronym = (r[3] || '').trim().toUpperCase();
        if (name && acronym && !/^(name|acronym|initials)/i.test(name)) {
          initialsMap[acronym] = name;
        }
      });
    }

    _trInitialsMap = initialsMap;
    _trNameMap     = {};
    Object.entries(initialsMap).forEach(([ini, name]) => {
      _trNameMap[name.toLowerCase()] = ini;
    });
    _trDataLoaded = true;

    /* Populate datalist */
    const dl = document.getElementById('tr-teacher-datalist');
    if (dl) {
      dl.innerHTML = '';
      Object.entries(initialsMap)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .forEach(([ini, name]) => {
          const opt = document.createElement('option');
          opt.value = `${name} (${ini})`;
          dl.appendChild(opt);
        });
    }
  } catch(e) {}
}

/* ── Resolve user input → initials ── */
function _trResolveInitials(raw) {
  /* Datalist selection format: "Full Name (INI)" */
  const datalistHit = raw.match(/\(([A-Za-z]+)\)\s*$/);
  if (datalistHit) return datalistHit[1].toUpperCase();

  const upper = raw.toUpperCase();

  /* Exact initials match */
  if (_trInitialsMap[upper]) return upper;

  /* Exact name match */
  const lower = raw.toLowerCase().trim();
  if (_trNameMap[lower]) return _trNameMap[lower];

  /* Partial name match: starts-with, then contains */
  for (const [name, ini] of Object.entries(_trNameMap)) {
    if (name.startsWith(lower)) return ini;
  }
  for (const [name, ini] of Object.entries(_trNameMap)) {
    if (name.includes(lower)) return ini;
  }

  /* Fall back: treat as raw initials */
  return upper;
}

/* ── Main search ── */
async function doTeacherSearch() {
  const input     = document.getElementById('teacherInitialsInput');
  const resultDiv = document.getElementById('teacherRoutineResult');
  const btn       = document.getElementById('teacherSearchBtn');
  if (!input || !resultDiv) return;

  const raw = input.value.trim();
  if (!raw) { input.focus(); return; }

  const initials = _trResolveInitials(raw);

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; }
  resultDiv.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Fetching routine...</div>';

  try {
    /* Reuse cached data if available; otherwise fresh fetch */
    let courseInfo = _trCourseInfo;
    let dayResults = _trDayResults;
    let sem;

    if (!courseInfo || !dayResults || !_trSheetId) {
      const [routineSheetId, s] = await Promise.all([getRoutineSheetId(), getSemesterLabel()]);
      _trSheetId = routineSheetId;
      sem = s;
      const cpgFetch   = fetchSheet('CPG_Courses').catch(() => null);
      const dayFetches = ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null));
      const [cpgData, ...dr] = await Promise.all([cpgFetch, ...dayFetches]);

      courseInfo = {};
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
      _trCourseInfo = courseInfo;
      _trDayResults = dr;
      dayResults    = dr;
    } else {
      sem = await getSemesterLabel();
    }

    const schedule = parseDayResults(dayResults, (cells, cell) => {
      const parsed = parseClassCell(cell);
      if (!parsed || parsed.initials.toUpperCase() !== initials) return null;
      return { batch: cells[1] || '', section: cells[2] || '' };
    });

    const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]);

    const teacherFullName = _trInitialsMap[initials] || '';

    if (!days.length) {
      resultDiv.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-user-slash" style="opacity:0.2;"></i>
        <p style="font-weight:600;">No classes found for
          <span style="color:#34d399;">${escH(teacherFullName || initials)}</span>
          ${teacherFullName ? `<span style="opacity:0.5;font-size:0.8rem;">(${escH(initials)})</span>` : ''}.
        </p>
        <p style="font-size:0.78rem;margin-top:6px;opacity:0.6;">
          ${teacherFullName ? 'This teacher may not have classes this semester.' : 'Check initials or name and try again.'}
        </p>
      </div>`;
      return;
    }

    const { allTimes, breakTimesSet } = deduplicateTimes(schedule);
    _teacherCache = { days, schedule, courseInfo, allTimes, breakTimesSet, initials, teacherFullName, semester: sem };

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];

    const nameDisplay = teacherFullName
      ? `<strong style="color:#34d399;">${escH(teacherFullName)}</strong>
         <span style="opacity:0.5;font-size:0.78rem;margin-left:4px;">(${escH(initials)})</span>`
      : `<strong style="color:#34d399;">${escH(initials)}</strong>`;

    resultDiv.innerHTML = `
      <div class="rt-sync" style="margin-top:4px;">
        <div class="rt-sync-dot"></div>
        <span>${nameDisplay} &nbsp;·&nbsp; ${sem} &nbsp;·&nbsp; ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
      </div>
      ${buildTeacherGrid(todayName)}
      <div class="rt-dl-bar">
        <button class="rt-dl-btn" onclick="downloadTeacherImage(this)">
          <i class="fa-solid fa-image"></i> Image Download
        </button>
        <button class="rt-dl-btn rt-dl-btn-pdf" onclick="downloadTeacherPDF(this)">
          <i class="fa-solid fa-file-pdf"></i> PDF Download
        </button>
      </div>`;

  } catch(e) {
    resultDiv.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load teacher routine.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${e.message}</p>
    </div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Generate Routine'; }
  }
}

/* ── Grid renderer ── */
function buildTeacherGrid(todayName) {
  if (!_teacherCache) return '';
  const { allTimes, schedule, courseInfo, breakTimesSet } = _teacherCache;
  if (!allTimes.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  const lookup = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    lookup[day] = {};
    (schedule[day] || []).forEach(s => { if (!lookup[day][s.time]) lookup[day][s.time] = s; });
  });

  let html = `<div id="rt-teacher-capture" class="rt-capture-area">
    <div class="rt-grid-wrap"><table class="rt-grid"><thead><tr>
    <th class="rt-th-day">Day</th>`;
  allTimes.forEach(time => {
    const isBreak = breakTimesSet.has(time);
    html += `<th${isBreak ? ' class="rt-th-break"' : ''}>${escH(time)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  ROUTINE_DAY_NAMES.forEach(day => {
    const daySlots = lookup[day];
    const hasClass = schedule[day]?.some(s => !s.isBreak);
    const isToday  = day === todayName;
    html += `<tr class="${hasClass ? 'has-class' : 'no-class'}">
      <td class="rt-grid-day-cell">${escH(DAY_DISPLAY[day] || day)}${isToday
        ? ' <span style="font-size:0.58rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;">Today</span>'
        : ''}</td>`;
    allTimes.forEach(time => {
      const isBreak = breakTimesSet.has(time);
      const slot    = daySlots[time];
      if (isBreak) {
        html += `<td class="rt-grid-break-cell">${slot?.isBreak ? '&#9749; Break' : ''}</td>`;
      } else if (slot && !slot.isBreak) {
        const color    = courseColor(slot.code);
        const batchSec = `${slot.batch || ''}${slot.section ? '-' + slot.section : ''}`;
        html += `<td><div class="rt-gc" style="background:${color}12;border-color:${color}33;">
          <span class="rt-gc-code" style="color:${color};">${escH(slot.code)}</span>
          <span class="rt-gc-teacher">${escH(batchSec)}</span>
          ${slot.room ? `<span class="rt-gc-room">${escH(slot.room)}</span>` : ''}
        </div></td>`;
      } else {
        html += `<td><span class="rt-grid-free">—</span></td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div></div>`;
  return html;
}

/* ── Download ── */
function downloadTeacherImage(btn) {
  if (!_teacherCache) return;
  const { initials, teacherFullName, semester } = _teacherCache;
  const label    = teacherFullName ? `${teacherFullName} (${initials})` : initials;
  const slug     = (semester || 'Routine').replace(/\s+/g, '');
  const safeName = initials.replace(/[^A-Za-z0-9]/g, '');
  _doDownloadImg(
    `Routine-Teacher-${safeName}-${slug}.png`,
    `Class Routine — ${label}`,
    `Teacher: ${label} · ${semester}`,
    _teacherCache,
    s => `${s.batch || ''}${s.section ? '-' + s.section : ''}`,
    btn
  );
}

function downloadTeacherPDF(btn) {
  if (!_teacherCache) return;
  const { initials, teacherFullName, semester } = _teacherCache;
  const label    = teacherFullName ? `${teacherFullName} (${initials})` : initials;
  const slug     = (semester || 'Routine').replace(/\s+/g, '');
  const safeName = initials.replace(/[^A-Za-z0-9]/g, '');
  _doDownloadPDF(
    `Routine-Teacher-${safeName}-${slug}.pdf`,
    `Class Routine — ${label}`,
    `Teacher: ${label} · ${semester}`,
    _teacherCache,
    s => `${s.batch || ''}${s.section ? '-' + s.section : ''}`,
    btn
  );
}
