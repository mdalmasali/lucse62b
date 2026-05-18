/* ─── Retake & Improve ─── */
/* Globals from info.html: fetchSheet, getRoutineSheetId, fetchDayTab,
   getSemesterLabel, ROUTINE_DAY_NAMES, parseClassCell, timeToMin,
   courseColor, escH, DAY_DISPLAY, sheetRows */

const _RI_WORKER = 'https://lucse62b-api.sy164425.workers.dev';
const _RI_SUPA   = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _RI_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

let _riActiveTab = 'retake';

/* ── Fetch retake/improve codes from result API (or use cache) ── */
async function _riGetCodes(userId, dob) {
  /* Reuse all-course.js function if it's already loaded */
  if (typeof _acFetchRetakeCodes === 'function') return _acFetchRetakeCodes();

  const cached = () => ({
    retake:  new Set(JSON.parse(localStorage.getItem('lu62b_retake_codes')  || '[]')),
    improve: new Set(JSON.parse(localStorage.getItem('lu62b_improve_codes') || '[]')),
  });

  if (!userId || !dob) return cached();

  try {
    let text = null;
    for (const [url, opts] of [
      [_RI_WORKER + '/result', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: userId, birth_date: dob }),
      }],
      [_RI_SUPA + '/functions/v1/get-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _RI_KEY },
        body: JSON.stringify({ student_id: userId, birth_date: dob }),
      }],
    ]) {
      try {
        const r = await fetch(url, opts);
        if (!r.ok) continue;
        const t = await r.text();
        if (!t.trimStart().startsWith('<')) { text = t; break; }
      } catch(e) {}
    }

    if (!text) return cached();
    const data = JSON.parse(text);
    if (!data?.success) return cached();

    const IMPROVE_GRADES = new Set(['B-', 'C+', 'C', 'D']);
    const retake = [], improve = [];
    for (const yearSems of Object.values(data.results || {})) {
      const sems = Array.isArray(yearSems) ? yearSems : Object.values(yearSems);
      for (const sem of sems) {
        for (const c of (sem.courses || [])) {
          const code = (c.course_code || '').trim().toUpperCase();
          if (!code) continue;
          if (c.grade === 'F') retake.push(code);
          else if (IMPROVE_GRADES.has(c.grade)) improve.push(code);
        }
      }
    }
    try {
      localStorage.setItem('lu62b_retake_codes',  JSON.stringify(retake));
      localStorage.setItem('lu62b_improve_codes', JSON.stringify(improve));
    } catch(e) {}
    return { retake: new Set(retake), improve: new Set(improve) };
  } catch(e) { return cached(); }
}

/* ── Scan ALL day tabs → build section-course-slot map + 62B busy times ── */
async function _riBuildRoutineData(routineSheetId) {
  const dayResults = await Promise.all(
    ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null))
  );

  /* sectionCourseSlots["62-A"]["CSE-3214"] = [{day, time, initials, room}] */
  const sectionCourseSlots = {};
  /* busy62B["SATURDAY"] = Set of timeToMin values */
  const busy62B = {};

  ROUTINE_DAY_NAMES.forEach((dayName, idx) => {
    const data = dayResults[idx];
    if (!data?.table) return;
    const rows = data.table.rows || [];
    const cols = data.table.cols || [];
    if (!rows.length) return;

    /* Detect time slot headers */
    let timeSlots = cols.slice(3).map(c => (c.label || '').trim());
    let dataStart = 0;
    if (!timeSlots.some(t => /\d+:\d+/.test(t))) {
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
        if (cells.slice(3).some(c => /\d+:\d+/.test(c))) {
          timeSlots = cells.slice(3); dataStart = r + 1; break;
        }
      }
    }

    /* Find break slot by majority vote */
    const breakCounts = {};
    for (let r = dataStart; r < rows.length; r++) {
      (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '').slice(3)
        .forEach((cell, i) => { if (cell.toUpperCase() === 'BREAK') breakCounts[i] = (breakCounts[i] || 0) + 1; });
    }
    let breakSlotIdx = -1, maxBrk = 0;
    Object.entries(breakCounts).forEach(([k, cnt]) => {
      if (cnt > maxBrk) { maxBrk = cnt; breakSlotIdx = parseInt(k); }
    });

    /* Scan all rows */
    for (let r = dataStart; r < rows.length; r++) {
      const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
      const batch   = cells[1] || '';
      const section = cells[2] || '';
      if (!batch || !section) continue;
      const key = `${batch}-${section}`;

      cells.slice(3).forEach((cell, i) => {
        if (!cell || cell.toUpperCase() === 'BREAK' || i === breakSlotIdx) return;
        const parsed = parseClassCell(cell);
        if (!parsed?.code) return;
        const time = timeSlots[i] || '';
        if (!time || !/\d+:\d+/.test(time)) return;

        const codeUp = parsed.code.toUpperCase();
        if (!sectionCourseSlots[key]) sectionCourseSlots[key] = {};
        if (!sectionCourseSlots[key][codeUp]) sectionCourseSlots[key][codeUp] = [];

        /* De-duplicate same day+time for same section+course */
        const alreadyHas = sectionCourseSlots[key][codeUp]
          .some(s => s.day === dayName && s.time === time);
        if (!alreadyHas) {
          sectionCourseSlots[key][codeUp].push({
            day: dayName, time,
            initials: parsed.initials || '',
            room:     parsed.room     || '',
          });
        }

        /* Build 62B busy map */
        if (batch === '62' && section === 'B') {
          if (!busy62B[dayName]) busy62B[dayName] = new Set();
          busy62B[dayName].add(timeToMin(time));
        }
      });
    }
  });

  return { sectionCourseSlots, busy62B };
}

/* ── Main loader ── */
async function loadRetakeImprove(body) {
  body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Retake &amp; Improve data...</div>';

  const user    = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
  const dob     = user?.id ? localStorage.getItem(`lu62b_dob_${user.id}`) : null;
  const needsDob = user?.id && !dob;

  try {
    const [myCodes, courseOfferData, cpgData, routineSheetId, sem] = await Promise.all([
      _riGetCodes(user?.id, dob),
      fetchSheet('LU_Course_Offer').catch(() => null),
      fetchSheet('CPG_Courses').catch(() => null),
      getRoutineSheetId(),
      getSemesterLabel(),
    ]);

    const { sectionCourseSlots, busy62B } = await _riBuildRoutineData(routineSheetId);

    /* ── Build course name map ── */
    const courseNameMap = {};

    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[1] && !['code', 'title', 'course'].includes((r[1] || '').toLowerCase()))
        .forEach(r => {
          const code = (r[1] || '').trim().toUpperCase();
          if (code) courseNameMap[code] = r[0]?.trim() || '';
        });
    }

    if (courseOfferData) {
      const offerRows = (courseOfferData.table?.rows || []).map(r =>
        (r.c || []).map(c => {
          if (!c) return '';
          if (c.f != null && c.f !== '') return String(c.f).trim();
          return c.v != null ? String(c.v).trim() : '';
        })
      );
      const firstVal = (offerRows[0]?.[0] || '').toLowerCase().trim();
      const startIdx = (firstVal === 'batch' || firstVal === 'semester') ? 1 : 0;
      for (let i = startIdx; i < offerRows.length; i++) {
        const r = offerRows[i];
        const code  = (r[1] || '').trim().toUpperCase();
        const title = (r[2] || '').trim();
        if (code && title) courseNameMap[code] = title;
      }
    }

    /* ── For a given course, find all sections + conflict info ── */
    function getSectionsForCourse(codeUp) {
      const result = [];
      for (const [key, courses] of Object.entries(sectionCourseSlots)) {
        if (!courses[codeUp]) continue;
        const dashIdx = key.indexOf('-');
        const batch   = key.slice(0, dashIdx);
        const section = key.slice(dashIdx + 1);
        const slots   = courses[codeUp];

        /* Conflict: any slot's day+time is in 62B busy map */
        const clashSlots = slots.filter(s => busy62B[s.day]?.has(timeToMin(s.time)));
        const hasConflict = clashSlots.length > 0;

        /* Most common initials in this section's slots */
        const initCount = {};
        slots.forEach(s => { if (s.initials) initCount[s.initials] = (initCount[s.initials] || 0) + 1; });
        const initials = Object.entries(initCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        result.push({ batch, section, slots, hasConflict, clashSlots, initials });
      }
      /* Sort: conflict-free first, then by batch, then section */
      result.sort((a, b) => {
        if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
        if (a.batch !== b.batch) return a.batch.localeCompare(b.batch);
        return a.section.localeCompare(b.section);
      });
      return result;
    }

    const { retake: retakeCodes, improve: improveCodes } = myCodes;
    const retakeList  = [...retakeCodes].sort();
    const improveList = [...improveCodes].sort();

    /* ── DOB prompt card ── */
    const dobCard = needsDob ? `
      <div class="ac-dob-card" id="ri-dob-card" style="margin-bottom:18px;">
        <div class="ac-dob-icon"><i class="fa-solid fa-calendar-check"></i></div>
        <div class="ac-dob-text">
          <strong>Enter your date of birth</strong>
          <span>Required to fetch your results and detect retake / improve courses.</span>
        </div>
        <div class="ac-dob-row">
          <input type="date" id="ri-dob-input" max="${new Date().toISOString().split('T')[0]}">
          <button onclick="_riDobSubmit()">Load <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>` : '';

    body.innerHTML = `
      ${dobCard}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="ri-tab ${_riActiveTab === 'retake' ? 'ri-tab-active' : ''}"
          onclick="riSwitchTab('retake')" id="ri-tab-retake">
          <i class="fa-solid fa-rotate-right"></i>
          Retake <span class="ri-tab-count" id="ri-cnt-retake">${retakeList.length}</span>
        </button>
        <button class="ri-tab ${_riActiveTab === 'improve' ? 'ri-tab-active' : ''}"
          onclick="riSwitchTab('improve')" id="ri-tab-improve">
          <i class="fa-solid fa-arrow-trend-up"></i>
          Improve <span class="ri-tab-count" id="ri-cnt-improve">${improveList.length}</span>
        </button>
      </div>
      <div id="ri-content"></div>`;

    /* Store for tab switching & DOB refresh */
    window._riData = { retakeList, improveList, getSectionsForCourse, courseNameMap, sem, busy62B };

    /* DOB submit handler */
    window._riDobSubmit = async function() {
      const input = document.getElementById('ri-dob-input');
      const dobVal = input?.value;
      if (!dobVal) { if (input) input.style.borderColor = '#f43f5e'; return; }
      const btn = input.nextElementSibling;
      btn.disabled = true; btn.textContent = 'Loading…';
      localStorage.setItem(`lu62b_dob_${user.id}`, dobVal);
      try {
        await fetch(`${_RI_SUPA}/rest/v1/rpc/set_student_dob`, {
          method: 'POST',
          headers: {
            'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_student_id: user.id, p_dob: dobVal }),
        });
      } catch(e) {}
      const newCodes = await _riGetCodes(user.id, dobVal);
      window._riData.retakeList  = [...newCodes.retake].sort();
      window._riData.improveList = [...newCodes.improve].sort();
      const cntR = document.getElementById('ri-cnt-retake');
      const cntI = document.getElementById('ri-cnt-improve');
      if (cntR) cntR.textContent = window._riData.retakeList.length;
      if (cntI) cntI.textContent = window._riData.improveList.length;
      document.getElementById('ri-dob-card')?.remove();
      riSwitchTab(_riActiveTab);
    };

    /* Tab switch handler */
    window.riSwitchTab = function(tab) {
      _riActiveTab = tab;
      document.querySelectorAll('.ri-tab').forEach(t => t.classList.remove('ri-tab-active'));
      document.getElementById(`ri-tab-${tab}`)?.classList.add('ri-tab-active');
      const d = window._riData;
      const list = tab === 'retake' ? d.retakeList : d.improveList;
      _riRenderContent(
        document.getElementById('ri-content'),
        list,
        tab === 'retake',
        d.getSectionsForCourse,
        d.courseNameMap,
        d.sem
      );
    };

    riSwitchTab(_riActiveTab);

  } catch(err) {
    console.error(err);
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load data.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${escH(err.message)}</p>
    </div>`;
  }
}

/* ── Render course cards for one tab ── */
function _riRenderContent(el, codeList, isRetake, getSectionsForCourse, courseNameMap, sem) {
  if (!el) return;

  if (!codeList.length) {
    const [icon, clr, msg, sub] = isRetake
      ? ['circle-check', '#34d399', 'No retake courses — great job!', 'No failed courses detected. If you think this is wrong, make sure your date of birth is set correctly.']
      : ['star',         '#fbbf24', 'No improve courses found.',       'No low-grade courses detected. If you think this is wrong, make sure your date of birth is set correctly.'];
    el.innerHTML = `<div class="info-placeholder" style="padding:40px 20px;">
      <i class="fa-solid fa-${icon}" style="color:${clr};opacity:0.35;font-size:2.2rem;display:block;margin-bottom:14px;"></i>
      <p style="font-weight:700;color:var(--text);margin-bottom:6px;">${msg}</p>
      <p style="font-size:0.78rem;max-width:340px;margin:0 auto;">${sub}</p>
    </div>`;
    return;
  }

  const cards = codeList.map(code => {
    const title    = courseNameMap[code] || '';
    const sections = getSectionsForCourse(code);
    const color    = courseColor(code);
    const freeCount  = sections.filter(s => !s.hasConflict).length;
    const clashCount = sections.filter(s =>  s.hasConflict).length;

    let bodyHtml = '';

    if (!sections.length) {
      bodyHtml = `<div style="font-size:0.8rem;color:var(--text-secondary);padding:10px 0;font-style:italic;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-circle-info" style="opacity:0.4;"></i>
        Not found in the current routine — may not be offered this semester.
      </div>`;
    } else {
      const summaryBadges = [
        freeCount  ? `<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(52,211,153,.14);color:#34d399;border:1px solid rgba(52,211,153,.28);">${freeCount} Free</span>` : '',
        clashCount ? `<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(244,63,94,.14);color:#f43f5e;border:1px solid rgba(244,63,94,.28);">${clashCount} Clash with 62B</span>` : '',
      ].filter(Boolean).join(' ');

      const tableRows = sections.map(sec => {
        /* Group slots by day */
        const dayGroups = {};
        sec.slots.forEach(s => {
          if (!dayGroups[s.day]) dayGroups[s.day] = [];
          dayGroups[s.day].push(s.time);
        });
        const schedule = Object.entries(dayGroups)
          .map(([d, times]) => `<strong>${escH(DAY_DISPLAY[d] || d)}</strong> ${times.map(escH).join(', ')}`)
          .join(' &nbsp;·&nbsp; ');

        const statusHtml = sec.hasConflict
          ? `<span style="color:#f43f5e;font-weight:700;font-size:0.72rem;white-space:nowrap;">
               <i class="fa-solid fa-triangle-exclamation"></i> Clash
             </span>`
          : `<span style="color:#34d399;font-weight:700;font-size:0.72rem;white-space:nowrap;">
               <i class="fa-solid fa-check-circle"></i> Free
             </span>`;

        const rowBg = sec.hasConflict ? 'rgba(244,63,94,.04)' : 'rgba(52,211,153,.03)';
        const borderLeft = sec.hasConflict ? '2px solid rgba(244,63,94,.3)' : '2px solid rgba(52,211,153,.25)';

        return `<tr style="background:${rowBg};border-left:${borderLeft};">
          <td style="padding:9px 12px;font-size:0.8rem;font-weight:700;color:var(--accent-bright);">${escH(sec.batch)}</td>
          <td style="padding:9px 12px;font-size:0.85rem;font-weight:800;">${escH(sec.section)}</td>
          <td style="padding:9px 12px;">
            ${sec.initials
              ? `<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#c4b5fd;background:rgba(196,181,253,.1);padding:2px 7px;border-radius:6px;">${escH(sec.initials)}</span>`
              : `<span style="opacity:0.3;font-size:0.78rem;">—</span>`}
          </td>
          <td style="padding:9px 12px;font-size:0.78rem;color:var(--text-secondary);">${schedule}</td>
          <td style="padding:9px 14px;">${statusHtml}</td>
        </tr>`;
      }).join('');

      bodyHtml = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:0.72rem;color:var(--text-secondary);">
            ${sections.length} section${sections.length !== 1 ? 's' : ''} in routine
          </span>
          ${summaryBadges}
        </div>
        <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:rgba(255,255,255,0.03);">
                ${['Batch','Section','Teacher','Schedule (vs 62B)','Status'].map(h =>
                  `<th style="padding:8px 12px;text-align:left;font-size:0.63rem;font-weight:700;
                    text-transform:uppercase;letter-spacing:0.07em;color:var(--text-secondary);
                    border-bottom:1px solid var(--border);white-space:nowrap;">${h}</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;
    }

    const tagClass = isRetake ? 'retake' : 'improve';
    const tagLabel = isRetake ? 'RETAKE' : 'IMPROVE';

    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);
        border-top:3px solid ${color};border-radius:14px;padding:18px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <span style="font-size:0.75rem;font-weight:800;padding:3px 10px;border-radius:6px;
            background:${color}1a;color:${color};letter-spacing:0.04em;">${escH(code)}</span>
          <span class="ac-retake-tag ${tagClass}">${tagLabel}</span>
          ${title ? `<span style="font-size:0.92rem;font-weight:700;color:var(--text);">${escH(title)}</span>` : ''}
        </div>
        ${bodyHtml}
      </div>`;
  });

  el.innerHTML = `
    <div class="rt-sync" style="margin-bottom:16px;">
      <div class="rt-sync-dot"></div>
      <span>${escH(sem)} &nbsp;·&nbsp; ${isRetake ? 'Retake' : 'Improve'} sections &nbsp;·&nbsp;
        <i class="fa-solid fa-shield-check" style="color:#34d399;margin-right:3px;"></i>
        Conflict checked against 62B schedule
      </span>
    </div>
    ${cards.join('')}`;
}
