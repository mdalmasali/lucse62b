/* ─── Teacher Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, parseDayResults,
   deduplicateTimes, courseColor, escH, DAY_DISPLAY,
   _doDownloadImg, _doDownloadPDF */

let _teacherCache = null;

function loadTeacherRoutine(body) {
  body.innerHTML = `
    <div class="rt-tf-wrap">
      <div class="rt-tf-heading"><i class="fa-solid fa-chalkboard-user" style="margin-right:6px;color:#34d399;"></i>Search by Teacher Initials</div>
      <div class="rt-tf-row">
        <input type="text" id="teacherInitialsInput" class="rt-tf-input"
          placeholder="e.g. NJN, MSR, SAZ" maxlength="10" />
        <button class="rt-tf-btn" id="teacherSearchBtn" onclick="doTeacherSearch()">
          <i class="fa-solid fa-magnifying-glass"></i> Generate Routine
        </button>
      </div>
      <div class="rt-tf-hint">Enter the teacher's initials exactly as shown in the class routine (e.g. NJN, MSR, RWA)</div>
    </div>
    <div id="teacherRoutineResult"></div>`;
  document.getElementById('teacherInitialsInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doTeacherSearch();
  });
}

async function doTeacherSearch() {
  const input     = document.getElementById('teacherInitialsInput');
  const resultDiv = document.getElementById('teacherRoutineResult');
  const btn       = document.getElementById('teacherSearchBtn');
  if (!input || !resultDiv) return;

  const initials = input.value.trim().toUpperCase();
  if (!initials) { input.focus(); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; }
  resultDiv.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Fetching routine...</div>';

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
            teacher: r[4]?.trim() || '',   // Column E — Teacher Name
            desig:   r[5]?.trim() || '',   // Column F — Designation
          };
        });
    }

    const schedule = parseDayResults(dayResults, (cells, cell) => {
      const parsed = parseClassCell(cell);
      if (!parsed || parsed.initials.toUpperCase() !== initials) return null;
      return { batch: cells[1] || '', section: cells[2] || '' };
    });

    const days = ROUTINE_DAY_NAMES.filter(d => schedule[d]);
    if (!days.length) {
      resultDiv.innerHTML = `<div class="info-placeholder">
        <i class="fa-solid fa-user-slash" style="opacity:0.2;"></i>
        <p style="font-weight:600;">No classes found for <span style="color:#34d399;">${escH(initials)}</span>.</p>
        <p style="font-size:0.78rem;margin-top:6px;opacity:0.6;">Check initials and try again.</p>
      </div>`;
      return;
    }

    const { allTimes, breakTimesSet } = deduplicateTimes(schedule);
    _teacherCache = { days, schedule, courseInfo, allTimes, breakTimesSet, initials, semester: sem };

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];
    resultDiv.innerHTML = `
      <div class="rt-sync" style="margin-top:4px;">
        <div class="rt-sync-dot"></div>
        <span>Teacher: <strong style="color:#34d399;">${escH(initials)}</strong> &nbsp;·&nbsp; ${sem} &nbsp;·&nbsp; ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
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
      <td class="rt-grid-day-cell">${escH(DAY_DISPLAY[day] || day)}${isToday ? ' <span style="font-size:0.58rem;background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;">Today</span>' : ''}</td>`;
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

function downloadTeacherImage(btn) {
  if (!_teacherCache) return;
  const ini  = _teacherCache.initials;
  const sem  = _teacherCache.semester || 'Routine';
  const slug = sem.replace(/\s+/g, '');
  _doDownloadImg(`Routine-Teacher-${ini}-${slug}.png`,
    `Class Routine — Teacher ${ini}`, `Teacher: ${ini} · ${sem}`,
    _teacherCache, (s) => `${s.batch||''}${s.section?'-'+s.section:''}`, btn);
}
function downloadTeacherPDF(btn) {
  if (!_teacherCache) return;
  const ini  = _teacherCache.initials;
  const sem  = _teacherCache.semester || 'Routine';
  const slug = sem.replace(/\s+/g, '');
  _doDownloadPDF(`Routine-Teacher-${ini}-${slug}.pdf`,
    `Class Routine — Teacher ${ini}`, `Teacher: ${ini} · ${sem}`,
    _teacherCache, (s) => `${s.batch||''}${s.section?'-'+s.section:''}`, btn);
}
