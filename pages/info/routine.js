/* ─── Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, timeToMin, courseColor,
   escH, DAY_DISPLAY, _doDownloadImg, _doDownloadPDF */

let _routineCache = null;

async function loadRoutine(body) {
  try {
    const routineSheetId = await getRoutineSheetId();

    const cpgFetch   = fetchSheet('CPG_Courses').catch(() => null);
    const dayFetches = ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null));
    const [cpgData, ...dayResults] = await Promise.all([cpgFetch, ...dayFetches]);

    const courseInfo = {};
    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[1] && !['code','title','course'].includes(r[1].toLowerCase()))
        .forEach(r => {
          courseInfo[r[1].trim().toUpperCase()] = {
            name: r[0].trim(), teacher: r[2]?.trim() || '', desig: r[3]?.trim() || ''
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

      let breakSlotIdx = -1, targetRow = null;

      for (let r = dataStart; r < rows.length; r++) {
        const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
        cells.slice(3).forEach((cell, i) => {
          if (cell.toUpperCase() === 'BREAK') breakSlotIdx = i;
        });
        if (cells[1] === '62' && cells[2] === 'B') targetRow = cells;
      }

      if (!targetRow) return;

      const classCells  = targetRow.slice(3);
      const daySchedule = [];

      timeSlots.forEach((time, i) => {
        if (!time) return;
        if (i === breakSlotIdx) { daySchedule.push({ isBreak: true, time }); return; }
        const parsed = parseClassCell(classCells[i]);
        if (parsed) daySchedule.push({ time, ...parsed });
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

    _routineCache = { days, schedule, courseInfo, allTimes, breakTimesSet };

    const todayName = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()];
    body.innerHTML = `
      <div class="rt-sync">
        <div class="rt-sync-dot"></div>
        <span>Live sync · Spring 2026 · Updated ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
      </div>
      ${buildGrid(todayName)}`;

  } catch(e) {
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load routine.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${e.message}</p>
    </div>`;
  }
}

function buildGrid(todayName) {
  if (!_routineCache) return '';
  const { allTimes, schedule, courseInfo, breakTimesSet } = _routineCache;
  if (!allTimes.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  const lookup = {};
  ROUTINE_DAY_NAMES.forEach(day => {
    lookup[day] = {};
    (schedule[day] || []).forEach(s => { lookup[day][s.time] = s; });
  });

  let html = `<div id="rt-capture" class="rt-capture-area">
    <div class="rt-capture-title"><i class="fa-solid fa-calendar-week" style="margin-right:6px;color:var(--accent-bright);"></i>Class Routine — Batch 62, Section B · Spring 2026</div>
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
        const color   = courseColor(slot.code);
        const info    = courseInfo[slot.code?.toUpperCase()] || {};
        const teacher = info.teacher || slot.initials || '';
        html += `<td><div class="rt-gc" style="background:${color}12;border-color:${color}33;">
          <span class="rt-gc-code" style="color:${color};">${escH(slot.code)}</span>
          ${teacher ? `<span class="rt-gc-teacher">${escH(teacher)}</span>` : ''}
          ${slot.room ? `<span class="rt-gc-room">${escH(slot.room)}</span>` : ''}
        </div></td>`;
      } else {
        html += `<td><span class="rt-grid-free">—</span></td>`;
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

function downloadRoutineImage(btn) {
  _doDownloadImg('Routine-CSE62B-Spring2026.png',
    'Class Routine', 'Batch 62, Section B · Spring 2026', _routineCache, null, btn);
}
function downloadRoutinePDF(btn) {
  _doDownloadPDF('Routine-CSE62B-Spring2026.pdf',
    'Class Routine', 'Batch 62, Section B · Spring 2026', _routineCache, null, btn);
}
