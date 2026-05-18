/* ─── Retake & Improve ─── */
/* Globals from info.html: fetchSheet, getRoutineSheetId, fetchDayTab,
   getSemesterLabel, ROUTINE_DAY_NAMES, parseClassCell, timeToMin,
   courseColor, escH, DAY_DISPLAY, sheetRows */

const _RI_WORKER = 'https://lucse62b-api.sy164425.workers.dev';
const _RI_SUPA   = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _RI_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

let _riActiveTab = 'retake';
window._riData   = null;

/* Read excluded 62B courses from localStorage (set by routine.js or My Courses panel) */
function _riGetExcluded() {
  if (window._rtExcluded instanceof Set) return window._rtExcluded;
  const user = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
  if (!user?.id) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(`lu62b_excl_${user.id}`) || '[]')); }
  catch(e) { return new Set(); }
}

/* ══════════════════════════════════════════════
   MANUAL COURSES — localStorage + Supabase
   ══════════════════════════════════════════════ */

function _riManualLocal() {
  try {
    return {
      retake:  new Set(JSON.parse(localStorage.getItem('lu62b_manual_retake')  || '[]')),
      improve: new Set(JSON.parse(localStorage.getItem('lu62b_manual_improve') || '[]')),
    };
  } catch(e) { return { retake: new Set(), improve: new Set() }; }
}

async function _riLoadManualFromSupa(userId) {
  try {
    const r = await fetch(
      `${_RI_SUPA}/rest/v1/student_manual_courses?student_id=eq.${encodeURIComponent(userId)}&select=retake,improve`,
      { headers: { 'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows.length) return null;
    return { retake: rows[0].retake || [], improve: rows[0].improve || [] };
  } catch(e) { return null; }
}

async function _riSaveManualToSupa(userId, retakeArr, improveArr) {
  try {
    await fetch(`${_RI_SUPA}/rest/v1/student_manual_courses`, {
      method:  'POST',
      headers: {
        'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        student_id: userId,
        retake:     retakeArr,
        improve:    improveArr,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch(e) {}
}

/* ══════════════════════════════════════════════
   ENROLLMENTS — Supabase + localStorage cache
   ══════════════════════════════════════════════ */

async function _riLoadEnrollments(userId) {
  if (!userId) return {};
  try {
    const r = await fetch(
      `${_RI_SUPA}/rest/v1/student_retake_enrollments?student_id=eq.${encodeURIComponent(userId)}&select=course_code,batch,section,teacher,type,schedule`,
      { headers: { 'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}` } }
    );
    if (!r.ok) return {};
    const rows = await r.json();
    const map = {};
    rows.forEach(row => { map[row.course_code] = row; });
    return map;
  } catch(e) { return {}; }
}

/* Shared helper — update localStorage, Supabase, _riData, re-render */
function _riMutateManual(code, action, type) {
  /* action: 'add' | 'remove'   type: 'retake' | 'improve' */
  const codeUp = code.trim().toUpperCase();
  const d = window._riData;
  if (!d) return;

  const retakeArr  = [...d.manualRetake];
  const improveArr = [...d.manualImprove];

  /* Remove from both first to avoid duplicates */
  const rIdx = retakeArr.indexOf(codeUp);
  if (rIdx > -1) retakeArr.splice(rIdx, 1);
  const iIdx = improveArr.indexOf(codeUp);
  if (iIdx > -1) improveArr.splice(iIdx, 1);

  if (action === 'add') {
    if (type === 'retake') retakeArr.push(codeUp);
    else                   improveArr.push(codeUp);
  }

  localStorage.setItem('lu62b_manual_retake',  JSON.stringify(retakeArr));
  localStorage.setItem('lu62b_manual_improve', JSON.stringify(improveArr));
  if (d.userId) _riSaveManualToSupa(d.userId, retakeArr, improveArr);

  d.manualRetake  = new Set(retakeArr);
  d.manualImprove = new Set(improveArr);
  d.retakeList    = [...new Set([...d.apiRetake,  ...d.manualRetake])].sort();
  d.improveList   = [...new Set([...d.apiImprove, ...d.manualImprove])].sort();

  /* Update tab count badges */
  const cntR = document.getElementById('ri-cnt-retake');
  const cntI = document.getElementById('ri-cnt-improve');
  if (cntR) cntR.textContent = d.retakeList.length;
  if (cntI) cntI.textContent = d.improveList.length;

  /* Re-render active tab */
  riSwitchTab(_riActiveTab);

  /* Refresh search result if same code is visible */
  const srEl = document.getElementById('ri-search-result');
  if (srEl && srEl.dataset.code === codeUp) _riRenderSearchResult(srEl, codeUp);
}

window._riAddManual    = (code, type) => _riMutateManual(code, 'add',    type);
window._riRemoveManual = (code, type) => _riMutateManual(code, 'remove', type);

window._riToggleEnroll = async function(courseCode, batch, section, type) {
  const d = window._riData;
  if (!d || !d.userId) return;
  const codeUp   = courseCode.toUpperCase();
  const existing = (d.enrollments || {})[codeUp];
  const isSame   = existing && existing.batch === batch && existing.section === section;

  if (isSame) {
    /* Unenroll */
    try {
      await fetch(
        `${_RI_SUPA}/rest/v1/student_retake_enrollments?student_id=eq.${encodeURIComponent(d.userId)}&course_code=eq.${encodeURIComponent(codeUp)}`,
        { method: 'DELETE', headers: { 'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}`, 'Prefer': 'return=minimal' } }
      );
    } catch(e) {}
    if (!d.enrollments) d.enrollments = {};
    delete d.enrollments[codeUp];
  } else {
    /* Enroll (upsert — replaces any existing section for this course) */
    const allSecs = d.getSectionsForCourse(codeUp);
    const sec     = allSecs.find(s => s.batch === batch && s.section === section);
    const slots   = sec?.slots || [];
    try {
      await fetch(`${_RI_SUPA}/rest/v1/student_retake_enrollments`, {
        method:  'POST',
        headers: {
          'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          student_id: d.userId, course_code: codeUp,
          course_name: d.courseNameMap[codeUp] || '',
          batch, section, teacher: sec?.initials || '', type,
          schedule: slots, enrolled_at: new Date().toISOString(),
        }),
      });
    } catch(e) {}
    if (!d.enrollments) d.enrollments = {};
    d.enrollments[codeUp] = { course_code: codeUp, batch, section, teacher: sec?.initials || '', type, schedule: slots };
  }

  /* Persist cache */
  try { localStorage.setItem(`lu62b_enrollments_${d.userId}`, JSON.stringify(d.enrollments)); } catch(e) {}

  /* Update My List count badge */
  const cntML = document.getElementById('ri-cnt-mylist');
  if (cntML) cntML.textContent = Object.keys(d.enrollments || {}).length;

  /* Re-render */
  riSwitchTab(_riActiveTab);
  const srEl = document.getElementById('ri-search-result');
  if (srEl && srEl.style.display !== 'none' && srEl.dataset.code) {
    _riRenderSearchResult(srEl, srEl.dataset.code);
  }
};

/* ══════════════════════════════════════════════
   RESULT API — fetch retake/improve from grades
   ══════════════════════════════════════════════ */

async function _riGetCodes(userId, dob) {
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

/* ══════════════════════════════════════════════
   ROUTINE SCAN — all sections + 62B busy map
   ══════════════════════════════════════════════ */

async function _riBuildRoutineData(routineSheetId) {
  const dayResults = await Promise.all(
    ROUTINE_DAY_NAMES.map(d => fetchDayTab(routineSheetId, d).catch(() => null))
  );

  /* sectionCourseSlots["62-A"]["CSE-3214"] = [{day, time, initials, room}] */
  const sectionCourseSlots = {};
  /* busy62BMap["SATURDAY"][timeInMin] = { code: "CSE-3214" }  ← stores clash course */
  const busy62BMap = {};

  ROUTINE_DAY_NAMES.forEach((dayName, idx) => {
    const data = dayResults[idx];
    if (!data?.table) return;
    const rows = data.table.rows || [];
    const cols = data.table.cols || [];
    if (!rows.length) return;

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

    /* Break slot detection by majority vote */
    const breakCounts = {};
    for (let r = dataStart; r < rows.length; r++) {
      (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '').slice(3)
        .forEach((cell, i) => { if (cell.toUpperCase() === 'BREAK') breakCounts[i] = (breakCounts[i] || 0) + 1; });
    }
    let breakSlotIdx = -1, maxBrk = 0;
    Object.entries(breakCounts).forEach(([k, cnt]) => {
      if (cnt > maxBrk) { maxBrk = cnt; breakSlotIdx = parseInt(k); }
    });

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

        /* Section course slots */
        if (!sectionCourseSlots[key]) sectionCourseSlots[key] = {};
        if (!sectionCourseSlots[key][codeUp]) sectionCourseSlots[key][codeUp] = [];
        const dup = sectionCourseSlots[key][codeUp].some(s => s.day === dayName && s.time === time);
        if (!dup) {
          sectionCourseSlots[key][codeUp].push({
            day: dayName, time,
            initials: parsed.initials || '',
            room:     parsed.room     || '',
          });
        }

        /* 62B busy map — stores the course code at each slot (skip excluded courses) */
        if (batch === '62' && section === 'B' && !_riGetExcluded().has(codeUp)) {
          if (!busy62BMap[dayName]) busy62BMap[dayName] = {};
          busy62BMap[dayName][timeToMin(time)] = { code: codeUp };
        }
      });
    }
  });

  return { sectionCourseSlots, busy62BMap };
}

/* ══════════════════════════════════════════════
   MAIN LOADER
   ══════════════════════════════════════════════ */

async function loadRetakeImprove(body) {
  body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Retake &amp; Improve...</div>';

  const user     = JSON.parse(localStorage.getItem('lu62b_student') || 'null');
  const dob      = user?.id ? localStorage.getItem(`lu62b_dob_${user.id}`) : null;
  const needsDob = user?.id && !dob;

  try {
    /* Load manual courses: localStorage first, then sync from Supabase */
    const localManual = _riManualLocal();
    let manualRetake  = localManual.retake;
    let manualImprove = localManual.improve;

    const [myCodes, courseOfferData, cpgData, teacherData, routineSheetId, sem] = await Promise.all([
      _riGetCodes(user?.id, dob),
      fetchSheet('LU_Course_Offer').catch(() => null),
      fetchSheet('CPG_Courses').catch(() => null),
      fetchSheet('CPG_Teachers').catch(() => null),
      getRoutineSheetId(),
      getSemesterLabel(),
    ]);

    /* Supabase sync for manual courses (background, non-blocking) */
    if (user?.id) {
      _riLoadManualFromSupa(user.id).then(supa => {
        if (!supa) return;
        /* Merge: Supabase wins (it may have data from another device) */
        const merged = {
          retake:  new Set([...manualRetake,  ...supa.retake]),
          improve: new Set([...manualImprove, ...supa.improve]),
        };
        localStorage.setItem('lu62b_manual_retake',  JSON.stringify([...merged.retake]));
        localStorage.setItem('lu62b_manual_improve', JSON.stringify([...merged.improve]));
        if (window._riData) {
          window._riData.manualRetake  = merged.retake;
          window._riData.manualImprove = merged.improve;
          window._riData.retakeList    = [...new Set([...window._riData.apiRetake,  ...merged.retake])].sort();
          window._riData.improveList   = [...new Set([...window._riData.apiImprove, ...merged.improve])].sort();
          const cntR = document.getElementById('ri-cnt-retake');
          const cntI = document.getElementById('ri-cnt-improve');
          if (cntR) cntR.textContent = window._riData.retakeList.length;
          if (cntI) cntI.textContent = window._riData.improveList.length;
          riSwitchTab(_riActiveTab);
        }
      });
    }

    const { sectionCourseSlots, busy62BMap } = await _riBuildRoutineData(routineSheetId);

    /* ── Course name map ── */
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
        const code = (r[1] || '').trim().toUpperCase();
        const title = (r[2] || '').trim();
        if (code && title) courseNameMap[code] = title;
      }
    }

    /* ── Initials → short teacher name map ── */
    const initialsMap = {}; /* e.g. { "ABM": "Dr. Ahmed" } */
    if (teacherData?.table) {
      const tRows = teacherData.table.rows || [];
      if (tRows.length > 1) {
        const hCells = (tRows[0].c || []).map(c => (c?.v != null ? String(c.v).trim().toLowerCase() : ''));

        /* Find initials column by header name, then fall back to content detection */
        let initCol = hCells.findIndex(h => /initial|abbr|short|code|acronym/.test(h));
        let nameCol = hCells.findIndex(h => /name|teacher/.test(h));

        if (initCol < 0 || nameCol < 0) {
          /* Content-based: initials = 2-4 uppercase only; name = longer with space */
          const sample = tRows.slice(1, 6).map(r => (r.c || []).map(c => c?.v != null ? String(c.v).trim() : ''));
          for (let col = 0; col < (sample[0]?.length || 0); col++) {
            const vals = sample.map(r => r[col]).filter(Boolean);
            if (vals.length && vals.every(v => /^[A-Z]{2,5}$/.test(v)) && initCol < 0) initCol = col;
            if (vals.length && vals.some(v => v.length > 5 && /\s/.test(v)) && nameCol < 0) nameCol = col;
          }
        }

        if (initCol >= 0 && nameCol >= 0) {
          tRows.slice(1).forEach(row => {
            const cells = (row.c || []).map(c => c?.v != null ? String(c.v).trim() : '');
            const init = cells[initCol]?.toUpperCase();
            const fullName = cells[nameCol];
            if (init && fullName) {
              initialsMap[init] = fullName;
            }
          });
        }
      }
    }

    /* ── Build section list for any course code ── */
    function getSectionsForCourse(codeUp) {
      const result = [];
      for (const [key, courses] of Object.entries(sectionCourseSlots)) {
        if (!courses[codeUp]) continue;
        const dashIdx = key.indexOf('-');
        const batch   = key.slice(0, dashIdx);
        const section = key.slice(dashIdx + 1);
        const slots   = courses[codeUp];

        const clashSlots = slots.filter(s => busy62BMap[s.day]?.[timeToMin(s.time)]);
        const hasConflict = clashSlots.length > 0;

        /* Which 62B courses clash (for display) */
        const clashCourseNames = [...new Set(
          clashSlots.map(s => {
            const info = busy62BMap[s.day]?.[timeToMin(s.time)];
            return courseNameMap[info?.code] || info?.code || '';
          }).filter(Boolean)
        )];

        const initCount = {};
        slots.forEach(s => { if (s.initials) initCount[s.initials] = (initCount[s.initials] || 0) + 1; });
        const initials = Object.entries(initCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        result.push({ batch, section, slots, hasConflict, clashCourseNames, initials });
      }
      result.sort((a, b) => {
        if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
        if (a.batch !== b.batch) return a.batch.localeCompare(b.batch);
        return a.section.localeCompare(b.section);
      });
      return result;
    }

    const { retake: apiRetake, improve: apiImprove } = myCodes;
    const retakeList  = [...new Set([...apiRetake,  ...manualRetake])].sort();
    const improveList = [...new Set([...apiImprove, ...manualImprove])].sort();

    /* ── Name → Code reverse lookup (for name-based search) ── */
    const nameToCode = {}; // lowercase name → uppercase code
    if (cpgData) {
      sheetRows(cpgData)
        .filter(r => r[0] && r[1]
          && !['name','title','course name','course'].includes((r[0] || '').toLowerCase().trim())
          && !['code','course code'].includes((r[1] || '').toLowerCase().trim()))
        .forEach(r => {
          const name = (r[0] || '').trim().toLowerCase();
          const code = (r[1] || '').trim().toUpperCase();
          if (name && code) nameToCode[name] = code;
        });
    }
    /* Also add from courseNameMap (includes LU_Course_Offer titles) */
    Object.entries(courseNameMap).forEach(([code, name]) => {
      if (name) nameToCode[name.toLowerCase()] = code;
    });

    /* ── Store global data ── */
    /* Quick local cache for enrollments (instant render before Supabase responds) */
    let enrollments = {};
    try {
      const cached = JSON.parse(localStorage.getItem(`lu62b_enrollments_${user?.id}`) || 'null');
      if (cached && typeof cached === 'object') enrollments = cached;
    } catch(e) {}

    window._riData = {
      apiRetake, apiImprove, manualRetake, manualImprove,
      retakeList, improveList,
      getSectionsForCourse, courseNameMap, nameToCode, initialsMap, sem,
      busy62BMap, userId: user?.id || null, enrollments,
    };

    /* Background: fetch fresh enrollments from Supabase and re-render */
    if (user?.id) {
      _riLoadEnrollments(user.id).then(fresh => {
        if (!window._riData) return;
        window._riData.enrollments = fresh;
        try { localStorage.setItem(`lu62b_enrollments_${user.id}`, JSON.stringify(fresh)); } catch(e) {}
        riSwitchTab(_riActiveTab);
      });
    }

    /* ── DOB prompt ── */
    const dobCard = needsDob ? `
      <div class="ac-dob-card" id="ri-dob-card" style="margin-bottom:18px;">
        <div class="ac-dob-icon"><i class="fa-solid fa-calendar-check"></i></div>
        <div class="ac-dob-text">
          <strong>Enter your date of birth</strong>
          <span>Required to detect retake &amp; improve courses from your results.</span>
        </div>
        <div class="ac-dob-row">
          <input type="date" id="ri-dob-input" max="${new Date().toISOString().split('T')[0]}">
          <button onclick="_riDobSubmit()">Load <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>` : '';

    body.innerHTML = `
      ${dobCard}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="ri-tab ${_riActiveTab === 'retake'  ? 'ri-tab-active' : ''}"
          onclick="riSwitchTab('retake')"  id="ri-tab-retake">
          <i class="fa-solid fa-rotate-right"></i>
          Retake <span class="ri-tab-count" id="ri-cnt-retake">${retakeList.length}</span>
        </button>
        <button class="ri-tab ${_riActiveTab === 'improve' ? 'ri-tab-active' : ''}"
          onclick="riSwitchTab('improve')" id="ri-tab-improve">
          <i class="fa-solid fa-arrow-trend-up"></i>
          Improve <span class="ri-tab-count" id="ri-cnt-improve">${improveList.length}</span>
        </button>
        ${window._riData?.userId ? `
        <button class="ri-tab ${_riActiveTab === 'mylist'  ? 'ri-tab-active' : ''}"
          onclick="riSwitchTab('mylist')"  id="ri-tab-mylist"
          style="border-color:rgba(99,102,241,.35);">
          <i class="fa-solid fa-list-check"></i>
          My List <span class="ri-tab-count" id="ri-cnt-mylist"
            style="background:rgba(99,102,241,.25);color:#818cf8;">
            ${Object.keys(window._riData.enrollments || {}).length}
          </span>
        </button>` : ''}
        <div style="flex:1;min-width:160px;display:flex;gap:8px;align-items:center;margin-left:auto;">
          <div style="position:relative;flex:1;">
            <input type="text" id="ri-search-input" placeholder="Course code or name…"
              style="width:100%;padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.05);
              border:1px solid var(--border);color:var(--text);font-size:0.82rem;
              font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;"
              onkeydown="if(event.key==='Enter'){_riDoSearch();document.getElementById('ri-sugg').style.display='none';}"
              oninput="_riSearchInput(this.value)">
            <div id="ri-sugg"
              style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
              background:var(--card);border:1px solid var(--border);border-radius:10px;
              box-shadow:0 8px 24px rgba(0,0,0,0.45);z-index:100;max-height:210px;overflow-y:auto;"></div>
          </div>
          <button onclick="_riDoSearch()"
            style="padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));
            color:#fff;font-size:0.8rem;font-weight:700;border:none;cursor:pointer;
            font-family:'Inter',sans-serif;white-space:nowrap;flex-shrink:0;">
            <i class="fa-solid fa-magnifying-glass"></i> Search
          </button>
        </div>
      </div>
      <div id="ri-search-result" style="display:none;"></div>
      <div id="ri-content"></div>`;

    /* ── DOB submit ── */
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
          headers: { 'apikey': _RI_KEY, 'Authorization': `Bearer ${_RI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_student_id: user.id, p_dob: dobVal }),
        });
      } catch(e) {}
      const newCodes = await _riGetCodes(user.id, dobVal);
      window._riData.apiRetake  = newCodes.retake;
      window._riData.apiImprove = newCodes.improve;
      window._riData.retakeList  = [...new Set([...newCodes.retake,  ...window._riData.manualRetake])].sort();
      window._riData.improveList = [...new Set([...newCodes.improve, ...window._riData.manualImprove])].sort();
      const cntR = document.getElementById('ri-cnt-retake');
      const cntI = document.getElementById('ri-cnt-improve');
      if (cntR) cntR.textContent = window._riData.retakeList.length;
      if (cntI) cntI.textContent = window._riData.improveList.length;
      document.getElementById('ri-dob-card')?.remove();
      riSwitchTab(_riActiveTab);
    };

    /* ── Autocomplete: show dropdown as user types ── */
    window._riSearchInput = function(val) {
      const sugg = document.getElementById('ri-sugg');
      if (!sugg) return;
      const q = val.trim().toLowerCase();
      if (q.length < 2) { sugg.style.display = 'none'; return; }

      const d = window._riData;
      const seen = new Set();
      const matches = [];

      /* Match against courseNameMap (code → name) */
      Object.entries(d.courseNameMap || {}).forEach(([code, name]) => {
        if (seen.has(code)) return;
        if (code.toLowerCase().includes(q) || (name || '').toLowerCase().includes(q)) {
          matches.push({ code, name: name || '' });
          seen.add(code);
        }
      });
      /* Also check nameToCode for any remaining entries */
      Object.entries(d.nameToCode || {}).forEach(([name, code]) => {
        if (seen.has(code)) return;
        if (name.includes(q) || code.toLowerCase().includes(q)) {
          matches.push({ code, name: d.courseNameMap[code] || name });
          seen.add(code);
        }
      });

      if (!matches.length) { sugg.style.display = 'none'; return; }

      sugg.innerHTML = matches.slice(0, 8).map(m => `
        <div onclick="_riSelectSugg('${m.code}')"
          style="padding:9px 14px;cursor:pointer;font-size:0.82rem;
          border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.12s;"
          onmouseover="this.style.background='rgba(124,58,237,0.12)'"
          onmouseout="this.style.background=''">
          <span style="font-weight:700;color:var(--accent-bright);font-family:monospace;
            font-size:0.78rem;">${escH(m.code)}</span>
          ${m.name ? `<span style="color:var(--text-secondary);margin-left:8px;font-size:0.78rem;">${escH(m.name)}</span>` : ''}
        </div>`).join('');
      sugg.style.display = 'block';
    };

    window._riSelectSugg = function(code) {
      const input = document.getElementById('ri-search-input');
      const sugg  = document.getElementById('ri-sugg');
      if (input) input.value = code;
      if (sugg)  sugg.style.display = 'none';
      _riDoSearch();
    };

    /* Close dropdown on outside click */
    document.addEventListener('click', function(e) {
      const sugg = document.getElementById('ri-sugg');
      if (sugg && !sugg.contains(e.target) && e.target.id !== 'ri-search-input') {
        sugg.style.display = 'none';
      }
    }, { capture: true });

    /* ── Search handler ── */
    window._riDoSearch = function() {
      const input = document.getElementById('ri-search-input');
      const sugg  = document.getElementById('ri-sugg');
      if (sugg) sugg.style.display = 'none';

      const raw = (input?.value || '').trim();
      if (!raw) { if (input) input.style.borderColor = '#f43f5e'; return; }
      if (input) input.style.borderColor = '';

      const d = window._riData;
      let code = raw.toUpperCase();

      /* If input doesn't look like a code, try name lookup */
      if (d?.nameToCode && !raw.includes('-') && !/^[A-Z]{2,4}\d{3,4}$/i.test(raw)) {
        const exact = d.nameToCode[raw.toLowerCase()];
        if (exact) {
          code = exact;
        } else {
          const partials = Object.entries(d.nameToCode)
            .filter(([name]) => name.includes(raw.toLowerCase()))
            .map(([, c]) => c);
          if (partials.length >= 1) code = partials[0];
        }
      }

      const srEl = document.getElementById('ri-search-result');
      if (!srEl) return;
      srEl.dataset.code = code;
      srEl.style.display = 'block';
      _riRenderSearchResult(srEl, code);
    };

    /* ── Tab switch ── */
    window.riSwitchTab = function(tab) {
      _riActiveTab = tab;
      document.querySelectorAll('.ri-tab').forEach(t => t.classList.remove('ri-tab-active'));
      document.getElementById(`ri-tab-${tab}`)?.classList.add('ri-tab-active');
      const d = window._riData;
      const el = document.getElementById('ri-content');
      if (tab === 'mylist') {
        _riRenderMyList(el);
      } else {
        const list = tab === 'retake' ? d.retakeList : d.improveList;
        _riRenderContent(el, list, tab === 'retake');
      }
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

/* ══════════════════════════════════════════════
   SEARCH RESULT CARD
   ══════════════════════════════════════════════ */

function _riRenderSearchResult(el, code) {
  const d = window._riData;
  if (!d) return;
  const codeUp   = code.toUpperCase();
  const title    = d.courseNameMap[codeUp] || '';
  const color    = courseColor(codeUp);
  const sections = d.getSectionsForCourse(codeUp);

  const inApiRetake   = d.apiRetake.has(codeUp);
  const inApiImprove  = d.apiImprove.has(codeUp);
  const inManualRetake  = d.manualRetake.has(codeUp);
  const inManualImprove = d.manualImprove.has(codeUp);
  const inRetake  = inApiRetake  || inManualRetake;
  const inImprove = inApiImprove || inManualImprove;

  /* Save / remove buttons */
  function saveBtn(type) {
    const isIn     = type === 'retake' ? inRetake  : inImprove;
    const isManual = type === 'retake' ? inManualRetake : inManualImprove;
    const isApi    = type === 'retake' ? inApiRetake    : inApiImprove;
    const label    = type === 'retake' ? 'Retake' : 'Improve';
    const clr      = type === 'retake' ? '#f43f5e' : '#fb923c';
    const bg       = type === 'retake' ? 'rgba(244,63,94,.15)' : 'rgba(251,146,60,.15)';
    const bord     = type === 'retake' ? 'rgba(244,63,94,.3)'  : 'rgba(251,146,60,.3)';

    if (isApi) {
      return `<span style="font-size:0.75rem;color:${clr};font-weight:600;padding:6px 12px;
        border-radius:8px;background:${bg};border:1px solid ${bord};display:inline-flex;align-items:center;gap:5px;">
        <i class="fa-solid fa-check-circle"></i> Already in ${label} (from results)
      </span>`;
    }
    if (isManual) {
      return `<button onclick="_riRemoveManual('${codeUp}','${type}')"
        style="font-size:0.75rem;color:${clr};font-weight:600;padding:6px 12px;border-radius:8px;
        background:${bg};border:1px solid ${bord};cursor:pointer;font-family:'Inter',sans-serif;
        display:inline-flex;align-items:center;gap:5px;">
        <i class="fa-solid fa-bookmark"></i> Saved in ${label}
        &nbsp;<span style="opacity:0.6;font-size:0.7rem;">× Remove</span>
      </button>`;
    }
    return `<button onclick="_riAddManual('${codeUp}','${type}')"
      style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;padding:6px 12px;
      border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid var(--border);
      cursor:pointer;font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:5px;
      transition:all 0.15s;" onmouseover="this.style.borderColor='${clr}';this.style.color='${clr}'"
      onmouseout="this.style.borderColor='';this.style.color=''">
      <i class="fa-solid fa-plus"></i> Add to ${label}
    </button>`;
  }

  const srType = inRetake ? 'retake' : 'improve';
  let tableHtml = '';
  if (!sections.length) {
    tableHtml = `<div style="font-size:0.8rem;color:var(--text-secondary);padding:10px 0;
      font-style:italic;display:flex;align-items:center;gap:8px;">
      <i class="fa-solid fa-circle-info" style="opacity:0.4;"></i>
      Not found in the current routine — may not be offered this semester.
    </div>`;
  } else {
    tableHtml = _riSectionTable(sections, d.courseNameMap, codeUp, srType);
  }

  el.innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(124,58,237,0.3);
      border-left:3px solid ${color};border-radius:14px;padding:18px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;
        flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:0.78rem;font-weight:800;padding:3px 10px;border-radius:6px;
            background:${color}1a;color:${color};">${escH(codeUp)}</span>
          ${title ? `<span style="font-size:0.9rem;font-weight:700;color:var(--text);">${escH(title)}</span>` : ''}
        </div>
        <button onclick="document.getElementById('ri-search-result').style.display='none'"
          style="font-size:0.75rem;color:var(--text-secondary);background:none;border:none;
          cursor:pointer;padding:4px 8px;border-radius:6px;">✕ Close</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        ${saveBtn('retake')}
        ${saveBtn('improve')}
      </div>
      ${tableHtml}
    </div>`;
}

/* ══════════════════════════════════════════════
   TAB CONTENT RENDERER
   ══════════════════════════════════════════════ */

function _riRenderContent(el, codeList, isRetake) {
  if (!el) return;
  const d = window._riData;

  if (!codeList.length) {
    const [icon, clr, msg] = isRetake
      ? ['circle-check', '#34d399', 'No retake courses — great job!']
      : ['star',         '#fbbf24', 'No improve courses found.'];
    el.innerHTML = `<div class="info-placeholder" style="padding:40px 20px;">
      <i class="fa-solid fa-${icon}" style="color:${clr};opacity:0.35;font-size:2.2rem;display:block;margin-bottom:14px;"></i>
      <p style="font-weight:700;color:var(--text);margin-bottom:6px;">${msg}</p>
      <p style="font-size:0.78rem;max-width:340px;margin:0 auto;">
        If you think this is wrong, make sure your date of birth is set correctly above.
      </p>
    </div>`;
    return;
  }

  const cards = codeList.map(code => {
    const codeUp   = code.toUpperCase();
    const title    = d.courseNameMap[codeUp] || '';
    const color    = courseColor(codeUp);
    const sections = d.getSectionsForCourse(codeUp);

    const isManual  = isRetake ? d.manualRetake.has(codeUp) : d.manualImprove.has(codeUp);
    const isApiCode = isRetake ? d.apiRetake.has(codeUp)    : d.apiImprove.has(codeUp);

    const freeCount  = sections.filter(s => !s.hasConflict).length;
    const clashCount = sections.filter(s =>  s.hasConflict).length;

    const tagClass  = isRetake ? 'retake'  : 'improve';
    const tagLabel  = isRetake ? 'RETAKE'  : 'IMPROVE';
    const typeStr   = isRetake ? 'retake'  : 'improve';

    const manualBadge = isManual
      ? `<span style="font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:5px;
          background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3);
          display:inline-flex;align-items:center;gap:4px;">
          <i class="fa-solid fa-pen-to-square" style="font-size:0.55rem;"></i> Manual
        </span>` : '';

    const removeBtn = isManual
      ? `<button onclick="_riRemoveManual('${codeUp}','${typeStr}')"
          style="margin-left:auto;font-size:0.7rem;color:var(--text-secondary);
          background:rgba(255,255,255,0.04);border:1px solid var(--border);
          border-radius:6px;padding:3px 9px;cursor:pointer;font-family:'Inter',sans-serif;
          transition:all 0.15s;" title="Remove from ${tagLabel}"
          onmouseover="this.style.color='#f43f5e';this.style.borderColor='rgba(244,63,94,0.4)'"
          onmouseout="this.style.color='';this.style.borderColor=''">
          × Remove
        </button>` : '';

    let bodyHtml = '';
    if (!sections.length) {
      bodyHtml = `<div style="font-size:0.8rem;color:var(--text-secondary);padding:10px 0;
        font-style:italic;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-circle-info" style="opacity:0.4;"></i>
        Not found in the current routine — may not be offered this semester.
      </div>`;
    } else {
      const summaryBadges = [
        freeCount  ? `<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(52,211,153,.14);color:#34d399;border:1px solid rgba(52,211,153,.28);">${freeCount} Free</span>` : '',
        clashCount ? `<span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(244,63,94,.14);color:#f43f5e;border:1px solid rgba(244,63,94,.28);">${clashCount} Clash</span>` : '',
      ].filter(Boolean).join(' ');
      bodyHtml = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:0.72rem;color:var(--text-secondary);">
            ${sections.length} section${sections.length !== 1 ? 's' : ''} in routine
          </span>
          ${summaryBadges}
        </div>
        ${_riSectionTable(sections, d.courseNameMap, codeUp, typeStr)}`;
    }

    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);
        border-top:3px solid ${color};border-radius:14px;padding:18px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <span style="font-size:0.75rem;font-weight:800;padding:3px 10px;border-radius:6px;
            background:${color}1a;color:${color};letter-spacing:0.04em;">${escH(codeUp)}</span>
          <span class="ac-retake-tag ${tagClass}">${tagLabel}</span>
          ${manualBadge}
          ${title ? `<span style="font-size:0.92rem;font-weight:700;color:var(--text);">${escH(title)}</span>` : ''}
          ${removeBtn}
        </div>
        ${bodyHtml}
      </div>`;
  });

  el.innerHTML = `
    <div class="rt-sync" style="margin-bottom:16px;">
      <div class="rt-sync-dot"></div>
      <span>${escH(d.sem)} &nbsp;·&nbsp; ${isRetake ? 'Retake' : 'Improve'} sections &nbsp;·&nbsp;
        <i class="fa-solid fa-shield-check" style="color:#34d399;margin-right:3px;"></i>
        Conflict checked vs 62B schedule
      </span>
    </div>
    ${cards.join('')}`;
}

/* ══════════════════════════════════════════════
   MY LIST — enrolled retake/improve courses
   ══════════════════════════════════════════════ */

function _riRenderMyList(el) {
  if (!el) return;
  const d = window._riData;
  const enrollments = Object.values(d?.enrollments || {});

  if (!enrollments.length) {
    el.innerHTML = `<div class="info-placeholder" style="padding:48px 20px;">
      <i class="fa-solid fa-list-check" style="opacity:0.2;font-size:2rem;display:block;margin-bottom:14px;"></i>
      <p style="font-weight:700;">No courses enrolled yet</p>
      <p style="font-size:0.78rem;margin-top:6px;color:var(--text-secondary);">
        Switch to Retake or Improve tab and click <strong>Enroll</strong> on a section.
      </p>
    </div>`;
    return;
  }

  const rows = enrollments.map(e => {
    const isRetake   = e.type === 'retake';
    const badgeColor = isRetake ? '#f43f5e' : '#fb923c';
    const badgeBg    = isRetake ? 'rgba(244,63,94,.15)' : 'rgba(251,146,60,.15)';
    const label      = isRetake ? 'RETAKE' : 'IMPROVE';
    const codeColor  = courseColor(e.course_code || '');
    const name       = d.courseNameMap[e.course_code] || e.course_name || '';

    const slots      = (e.schedule || []);
    const dayGroups  = {};
    slots.forEach(s => {
      if (!dayGroups[s.day]) dayGroups[s.day] = [];
      dayGroups[s.day].push(s.time);
    });
    const scheduleStr = Object.entries(dayGroups)
      .map(([day, times]) => `<strong>${escH(DAY_DISPLAY[day] || day)}</strong> ${times.map(escH).join(', ')}`)
      .join(' &nbsp;·&nbsp; ');

    const teacherFull = (d?.initialsMap || {})[e.teacher] || '';

    return `<div style="display:flex;align-items:stretch;border-radius:13px;overflow:hidden;
        border:1px solid var(--border);background:${badgeBg.replace('.15',',.04')};
        margin-bottom:10px;">
      <div style="width:4px;background:${badgeColor};flex-shrink:0;"></div>
      <div style="padding:13px 16px;flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px;">
          <span style="font-family:monospace;font-size:0.78rem;font-weight:800;color:${codeColor};
            background:${codeColor}1a;padding:2px 8px;border-radius:5px;">${escH(e.course_code || '')}</span>
          <span style="font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:5px;
            background:${badgeBg};color:${badgeColor};letter-spacing:0.05em;">${label}</span>
          ${name ? `<span style="font-size:0.85rem;font-weight:700;color:var(--text);">${escH(name)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:0.74rem;color:var(--text-secondary);">
          <span><strong style="color:var(--accent-bright);">${escH(e.batch || '')}${escH(e.section || '')}</strong></span>
          ${e.teacher ? `<span style="font-family:monospace;font-size:0.72rem;font-weight:700;color:#c4b5fd;
            background:rgba(196,181,253,.1);padding:1px 7px;border-radius:5px;">${escH(e.teacher)}</span>
            ${teacherFull ? `<span style="font-size:0.72rem;">${escH(teacherFull)}</span>` : ''}` : ''}
          ${scheduleStr ? `<span>${scheduleStr}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;padding:0 14px;flex-shrink:0;">
        <button onclick="_riToggleEnroll('${escH(e.course_code)}','${escH(e.batch)}','${escH(e.section)}','${escH(e.type)}')"
          style="font-size:0.68rem;font-weight:700;padding:5px 12px;border-radius:7px;cursor:pointer;
          font-family:'Inter',sans-serif;white-space:nowrap;
          background:rgba(244,63,94,.12);color:#f43f5e;border:1px solid rgba(244,63,94,.35);">
          Remove
        </button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:16px;">
      <div class="rt-sync" style="margin-bottom:12px;">
        <div class="rt-sync-dot"></div>
        <span>${enrollments.length} course${enrollments.length !== 1 ? 's' : ''} enrolled</span>
      </div>
      ${rows}
    </div>`;
}

/* ══════════════════════════════════════════════
   SHARED: section table (used by both tab + search)
   ══════════════════════════════════════════════ */

function _riSectionTable(sections, courseNameMap, courseCode, type) {
  const d          = window._riData;
  const showEnroll = !!(courseCode && d?.userId);

  const rows = sections.map(sec => {
    /* Group slots by day */
    const dayGroups = {};
    sec.slots.forEach(s => {
      if (!dayGroups[s.day]) dayGroups[s.day] = [];
      dayGroups[s.day].push(s.time);
    });
    const schedule = Object.entries(dayGroups)
      .map(([day, times]) => `<strong>${escH(DAY_DISPLAY[day] || day)}</strong> ${times.map(escH).join(', ')}`)
      .join(' &nbsp;·&nbsp; ');

    /* Check enrollment-vs-enrollment conflict first (needed for statusHtml) */
    const enrolled       = showEnroll ? (d.enrollments || {})[courseCode] : null;
    const isEnrolledHere = !!(enrolled && enrolled.batch === sec.batch && enrolled.section === sec.section);
    let enrollConflict = null;
    if (showEnroll && !isEnrolledHere) {
      const others = Object.entries(d.enrollments || {}).filter(([c]) => c !== courseCode);
      outer: for (const slot of sec.slots) {
        const slotMin = timeToMin(slot.time);
        for (const [c, enr] of others) {
          if ((enr.schedule || []).some(s => s.day === slot.day && timeToMin(s.time) === slotMin)) {
            enrollConflict = d.courseNameMap[c] || c;
            break outer;
          }
        }
      }
    }

    /* STATUS column — 62B clash takes priority, then enrollment conflict, then Free */
    let statusHtml;
    if (sec.hasConflict) {
      const clashWith = sec.clashCourseNames.length
        ? `<span style="font-size:0.65rem;color:var(--text-secondary);display:block;margin-top:2px;line-height:1.3;">
            ${escH(sec.clashCourseNames[0])}
           </span>`
        : '';
      statusHtml = `<span style="color:#f43f5e;font-weight:700;font-size:0.72rem;white-space:nowrap;">
          <i class="fa-solid fa-triangle-exclamation"></i> Clash
        </span>${clashWith}`;
    } else if (enrollConflict) {
      statusHtml = `<span style="color:#fbbf24;font-weight:700;font-size:0.72rem;white-space:nowrap;">
          <i class="fa-solid fa-triangle-exclamation"></i> Clash
        </span>
        <span style="font-size:0.65rem;color:var(--text-secondary);display:block;margin-top:2px;line-height:1.3;">
          ${escH(enrollConflict)}
        </span>`;
    } else {
      statusHtml = `<span style="color:#34d399;font-weight:700;font-size:0.72rem;white-space:nowrap;">
          <i class="fa-solid fa-check-circle"></i> Free
        </span>`;
    }

    const hasAnyConflict = sec.hasConflict || !!enrollConflict;
    const rowBg      = hasAnyConflict ? 'rgba(244,63,94,.04)' : 'rgba(52,211,153,.03)';
    const borderLeft = hasAnyConflict ? '2px solid rgba(244,63,94,.3)' : '2px solid rgba(52,211,153,.25)';

    let enrollCell = '';
    if (showEnroll) {
      if (isEnrolledHere) {
        enrollCell = `<td style="padding:7px 10px;vertical-align:middle;text-align:center;">
            <button onclick="_riToggleEnroll('${courseCode}','${sec.batch}','${sec.section}','${type}')"
              style="font-size:0.68rem;font-weight:700;padding:5px 11px;border-radius:7px;cursor:pointer;
              font-family:'Inter',sans-serif;white-space:nowrap;
              background:rgba(52,211,153,.18);color:#34d399;border:1px solid rgba(52,211,153,.4);">
              ✓ Enrolled
            </button>
           </td>`;
      } else {
        enrollCell = `<td style="padding:7px 10px;vertical-align:middle;text-align:center;">
            <button onclick="_riToggleEnroll('${courseCode}','${sec.batch}','${sec.section}','${type}')"
              style="font-size:0.68rem;font-weight:700;padding:5px 11px;border-radius:7px;cursor:pointer;
              font-family:'Inter',sans-serif;white-space:nowrap;
              background:rgba(124,58,237,.1);color:#a78bfa;border:1px solid rgba(124,58,237,.25);">
              Enroll
            </button>
           </td>`;
      }
    }

    return `<tr style="background:${rowBg};border-left:${borderLeft};">
      <td style="padding:9px 12px;font-size:0.8rem;font-weight:700;color:var(--accent-bright);vertical-align:middle;text-align:center;">${escH(sec.batch)}</td>
      <td style="padding:9px 12px;font-size:0.85rem;font-weight:800;vertical-align:middle;text-align:center;">${escH(sec.section)}</td>
      <td style="padding:9px 12px;vertical-align:middle;text-align:left;">
        ${sec.initials ? (() => {
          const fullName = (d?.initialsMap || {})[sec.initials] || '';
          return `<span style="font-family:monospace;font-size:0.8rem;font-weight:700;color:#c4b5fd;
              background:rgba(196,181,253,.1);padding:2px 7px;border-radius:6px;">${escH(sec.initials)}</span>
            ${fullName ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;line-height:1.35;font-weight:500;">${escH(fullName)}</div>` : ''}`;
        })() : `<span style="opacity:0.3;font-size:0.78rem;">—</span>`}
      </td>
      <td style="padding:9px 12px;font-size:0.78rem;color:var(--text-secondary);vertical-align:middle;text-align:left;">${schedule}</td>
      <td style="padding:9px 14px;vertical-align:middle;text-align:center;">${statusHtml}</td>
      ${enrollCell}
    </tr>`;
  }).join('');

  const thStyleCenter = `padding:8px 12px;text-align:center;font-size:0.63rem;font-weight:700;
    text-transform:uppercase;letter-spacing:0.07em;color:var(--text-secondary);
    border-bottom:1px solid var(--border);white-space:nowrap;`;
  const thStyleLeft = `padding:8px 12px;text-align:left;font-size:0.63rem;font-weight:700;
    text-transform:uppercase;letter-spacing:0.07em;color:var(--text-secondary);
    border-bottom:1px solid var(--border);white-space:nowrap;`;
  const enrollHeader = showEnroll
    ? `<th style="${thStyleCenter}">Enroll</th>` : '';

  return `<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:rgba(255,255,255,0.03);">
          <th style="${thStyleCenter}">Batch</th>
          <th style="${thStyleCenter}">Sec</th>
          <th style="${thStyleLeft}">Teacher</th>
          <th style="${thStyleLeft}">Schedule</th>
          <th style="${thStyleCenter}">Status vs 62B</th>
          ${enrollHeader}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
