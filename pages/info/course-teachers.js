/* ─── Course Teachers ─── */
/* Globals from info.html: fetchAllRoutineDays, fetchSheet, sheetRows,
   ROUTINE_DAY_NAMES, parseClassCell, courseColor, escH,
   _allDayResults (may be set if Routine tab was visited first) */

let _ctDataLoaded = false;
let _ctTeacherMap = null; /* initials → { name, desig, courses: [{code, name, sections:[{batch,section}]}] } */
let _ctCourseMap  = null; /* code → { name, teachers: [{initials, name, desig, sections:[{batch,section}]}] } */
let _ctView       = 'teacher'; /* 'teacher' | 'course' */

/* ── Main loader ── */
async function loadCourseTeachers(body) {
  body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading course teacher info...</div>';
  try {
    const routinePromise = (typeof _allDayResults !== 'undefined' && _allDayResults)
      ? Promise.resolve(_allDayResults)
      : fetchAllRoutineDays().catch(() => null);

    const [dayResults, cpgTeacherData, cpgCoursesData] = await Promise.all([
      routinePromise,
      fetchSheet('CPG_Teachers').catch(() => null),
      fetchSheet('CPG_Courses').catch(() => null),
    ]);

    /* ── Build teacher info map from CPG_Teachers ── */
    /* A=Acronym, B=Name, C=Designation */
    const teacherInfo = {}; /* uppercase initials → { name, desig } */
    if (cpgTeacherData) {
      sheetRows(cpgTeacherData).forEach(r => {
        const acr  = (r[0] || '').trim().toUpperCase();
        const name = (r[1] || '').trim();
        const desig = (r[2] || '').trim();
        if (acr && name && !/^(acronym|initials|name)/i.test(acr)) {
          teacherInfo[acr] = { name, desig };
        }
      });
    }

    /* ── Build course title map from CPG_Courses ── */
    /* A=Title, B=Code */
    const courseTitles = {}; /* uppercase code → title */
    if (cpgCoursesData) {
      sheetRows(cpgCoursesData).forEach(r => {
        const code  = (r[1] || '').trim().toUpperCase();
        const title = (r[0] || '').trim();
        if (code && title && !/^(code|title|course)/i.test(code)) {
          courseTitles[code] = title;
        }
      });
    }

    /* ── Scan all routine rows (all batches) ── */
    /* teacherMap: initials → { name, desig, courses: Map(code → Set of "batch-section") } */
    const teacherMapRaw = new Map();
    /* courseMapRaw: code → { name, teachers: Map(initials → Set of "batch-section") } */
    const courseMapRaw  = new Map();

    if (dayResults) {
      ROUTINE_DAY_NAMES.forEach((_, idx) => {
        const data = dayResults[idx];
        if (!data?.table) return;
        const rows = data.table.rows || [];
        const cols = data.table.cols || [];
        if (!rows.length) return;

        let dataStart = 0;
        const colTimes = cols.slice(3).map(c => (c.label || '').trim());
        if (!colTimes.some(t => /\d+:\d+/.test(t))) {
          for (let r = 0; r < Math.min(rows.length, 3); r++) {
            const cells = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
            if (cells.slice(3).some(c => /\d+:\d+/.test(c))) { dataStart = r + 1; break; }
          }
        }

        for (let r = dataStart; r < rows.length; r++) {
          const cells   = (rows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
          const batch   = String(cells[1] || '').replace(/\.0+$/, '').trim();
          const section = (cells[2] || '').trim().toUpperCase();
          if (!batch || !/^\d+$/.test(batch) || !section || !/^[A-Z]$/.test(section)) continue;

          const batchSec = `${batch}-${section}`;

          cells.slice(3).forEach(cell => {
            const parsed = typeof parseClassCell === 'function' ? parseClassCell(cell) : null;
            if (!parsed?.code) return;
            const code     = parsed.code.trim().toUpperCase();
            const initials = (parsed.initials || '').trim().toUpperCase();
            if (!initials || initials === 'BREAK') return;

            /* teacher → course+section */
            if (!teacherMapRaw.has(initials)) teacherMapRaw.set(initials, new Map());
            const tCourses = teacherMapRaw.get(initials);
            if (!tCourses.has(code)) tCourses.set(code, new Set());
            tCourses.get(code).add(batchSec);

            /* course → teacher+section */
            if (!courseMapRaw.has(code)) courseMapRaw.set(code, new Map());
            const cTeachers = courseMapRaw.get(code);
            if (!cTeachers.has(initials)) cTeachers.set(initials, new Set());
            cTeachers.get(initials).add(batchSec);
          });
        }
      });
    }

    /* ── Convert to display-ready structures ── */
    _ctTeacherMap = Array.from(teacherMapRaw.entries())
      .map(([initials, coursesMap]) => {
        const info = teacherInfo[initials] || {};
        return {
          initials,
          name:  info.name || initials,
          desig: info.desig || '',
          courses: Array.from(coursesMap.entries())
            .map(([code, secSet]) => ({
              code,
              name:     courseTitles[code] || '',
              sections: Array.from(secSet).sort(),
            }))
            .sort((a, b) => a.code.localeCompare(b.code)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    _ctCourseMap = Array.from(courseMapRaw.entries())
      .map(([code, teachersMap]) => ({
        code,
        name: courseTitles[code] || '',
        teachers: Array.from(teachersMap.entries())
          .map(([initials, secSet]) => {
            const info = teacherInfo[initials] || {};
            return {
              initials,
              name:     info.name || initials,
              desig:    info.desig || '',
              sections: Array.from(secSet).sort(),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    _ctDataLoaded = true;
    _ctView = 'teacher';
    _ctRender(body);

  } catch (e) {
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load course teacher info.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${escH(e.message)}</p>
    </div>`;
  }
}

/* ── Render the full UI ── */
function _ctRender(body) {
  const tCount = _ctTeacherMap?.length || 0;
  const cCount = _ctCourseMap?.length  || 0;

  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;align-items:center;">
      <button id="ct-tab-teacher" onclick="_ctSwitchView('teacher')"
        class="ri-tab${_ctView === 'teacher' ? ' ri-tab-active' : ''}">
        <i class="fa-solid fa-chalkboard-user"></i> By Teacher
        <span class="ri-tab-count">${tCount}</span>
      </button>
      <button id="ct-tab-course" onclick="_ctSwitchView('course')"
        class="ri-tab${_ctView === 'course' ? ' ri-tab-active' : ''}">
        <i class="fa-solid fa-book-open"></i> By Course
        <span class="ri-tab-count">${cCount}</span>
      </button>
      <div style="flex:1;min-width:160px;position:relative;">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:10px;top:50%;
          transform:translateY(-50%);opacity:0.4;font-size:0.76rem;pointer-events:none;"></i>
        <input id="ct-search" type="text" placeholder="Search…" autocomplete="off"
          oninput="_ctSearch(this.value)"
          style="width:100%;box-sizing:border-box;padding:7px 12px 7px 30px;
          background:rgba(255,255,255,0.05);border:1px solid var(--border);
          border-radius:8px;color:var(--text);font-size:0.82rem;outline:none;
          font-family:'Inter',sans-serif;"
          onfocus="this.style.borderColor='var(--accent-bright)'"
          onblur="this.style.borderColor='var(--border)'" />
      </div>
    </div>
    <div id="ct-body">${_ctBuildView()}</div>`;
}

/* ── Tab switch ── */
window._ctSwitchView = function(view) {
  _ctView = view;
  document.querySelectorAll('#ct-tab-teacher,#ct-tab-course').forEach(btn => {
    btn.classList.toggle('ri-tab-active', btn.id === `ct-tab-${view}`);
  });
  const search = document.getElementById('ct-search');
  const ctBody = document.getElementById('ct-body');
  if (ctBody) ctBody.innerHTML = _ctBuildView(search?.value || '');
};

/* ── Search filter ── */
window._ctSearch = function(q) {
  const ctBody = document.getElementById('ct-body');
  if (ctBody) ctBody.innerHTML = _ctBuildView(q);
};

/* ── Build current view HTML ── */
function _ctBuildView(q) {
  return _ctView === 'teacher' ? _ctByTeacher(q) : _ctByCourse(q);
}

/* ── Section chip helper ── */
function _ctSectionChips(sections) {
  return sections.map(s => {
    const [batch, sec] = s.split('-');
    const color = courseColor(`B${batch}${sec}`);
    return `<span style="display:inline-flex;align-items:center;gap:3px;
      font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:5px;
      background:${color}18;color:${color};border:1px solid ${color}44;">
      ${escH(batch)}<span style="opacity:0.7;">${escH(sec)}</span>
    </span>`;
  }).join('');
}

/* ── By Teacher view ── */
function _ctByTeacher(q) {
  if (!_ctTeacherMap?.length) return '<div class="rt-grid-empty-msg">No teacher data found.</div>';
  const lq = (q || '').toLowerCase().trim();

  const filtered = lq
    ? _ctTeacherMap.filter(t =>
        t.name.toLowerCase().includes(lq) ||
        t.initials.toLowerCase().includes(lq) ||
        t.desig.toLowerCase().includes(lq) ||
        t.courses.some(c => c.code.toLowerCase().includes(lq) || c.name.toLowerCase().includes(lq)))
    : _ctTeacherMap;

  if (!filtered.length) return '<div class="rt-grid-empty-msg">No matches found.</div>';

  return `<div class="info-card-grid">${filtered.map(t => {
    const coursesHtml = t.courses.map(c => {
      const color = courseColor(c.code);
      return `<div style="margin-bottom:6px;padding:8px 10px;border-radius:9px;
          background:${color}0d;border:1px solid ${color}33;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px;">
          <span style="font-size:0.68rem;font-weight:800;padding:2px 7px;border-radius:5px;
            background:${color}22;color:${color};letter-spacing:0.04em;">${escH(c.code)}</span>
          ${c.name ? `<span style="font-size:0.72rem;color:var(--text);font-weight:600;line-height:1.3;">${escH(c.name)}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${_ctSectionChips(c.sections)}</div>
      </div>`;
    }).join('');

    return `<div class="info-item-card" style="display:flex;flex-direction:column;gap:0;">
      <div style="margin-bottom:10px;">
        <div style="font-size:1rem;font-weight:700;color:var(--text);">${escH(t.name)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap;">
          <span style="font-family:monospace;font-size:0.72rem;font-weight:700;
            background:rgba(124,58,237,0.15);color:#c4b5fd;padding:1px 7px;border-radius:5px;">${escH(t.initials)}</span>
          ${t.desig ? `<span style="font-size:0.72rem;color:var(--accent-bright);font-weight:600;">${escH(t.desig)}</span>` : ''}
        </div>
      </div>
      ${coursesHtml
        ? `<div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;
              color:var(--text-secondary);font-weight:700;margin-bottom:7px;">
            <i class="fa-solid fa-book" style="margin-right:4px;opacity:0.5;"></i>Courses This Semester
           </div>${coursesHtml}`
        : '<div style="font-size:0.78rem;color:var(--text-secondary);opacity:0.5;">No courses assigned.</div>'}
    </div>`;
  }).join('')}</div>`;
}

/* ── By Course view ── */
function _ctByCourse(q) {
  if (!_ctCourseMap?.length) return '<div class="rt-grid-empty-msg">No course data found.</div>';
  const lq = (q || '').toLowerCase().trim();

  const filtered = lq
    ? _ctCourseMap.filter(c =>
        c.code.toLowerCase().includes(lq) ||
        c.name.toLowerCase().includes(lq) ||
        c.teachers.some(t => t.name.toLowerCase().includes(lq) || t.initials.toLowerCase().includes(lq)))
    : _ctCourseMap;

  if (!filtered.length) return '<div class="rt-grid-empty-msg">No matches found.</div>';

  return `<div class="info-card-grid">${filtered.map(c => {
    const color = courseColor(c.code);

    const teachersHtml = c.teachers.map(t => `
      <div style="padding:8px 10px;border-radius:9px;
          background:rgba(255,255,255,0.03);border:1px solid var(--border);margin-bottom:5px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px;">
          <span style="font-family:monospace;font-size:0.65rem;font-weight:700;
            background:rgba(124,58,237,0.15);color:#c4b5fd;padding:1px 6px;border-radius:5px;">${escH(t.initials)}</span>
          <span style="font-size:0.8rem;font-weight:600;color:var(--text);">${escH(t.name)}</span>
          ${t.desig ? `<span style="font-size:0.68rem;color:var(--text-secondary);">${escH(t.desig)}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${_ctSectionChips(t.sections)}</div>
      </div>`).join('');

    return `<div class="info-item-card" style="display:flex;flex-direction:column;gap:0;">
      <div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
          <span style="font-size:0.7rem;font-weight:800;padding:3px 9px;border-radius:6px;
            background:${color}22;color:${color};letter-spacing:0.06em;">${escH(c.code)}</span>
        </div>
        <div style="font-size:0.95rem;font-weight:700;color:var(--text);line-height:1.35;">
          ${escH(c.name || c.code)}
        </div>
      </div>
      ${teachersHtml
        ? `<div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;
              color:var(--text-secondary);font-weight:700;margin-bottom:7px;">
            <i class="fa-solid fa-chalkboard-user" style="margin-right:4px;opacity:0.5;"></i>Teachers & Sections
           </div>${teachersHtml}`
        : '<div style="font-size:0.78rem;color:var(--text-secondary);opacity:0.5;">No teacher assigned.</div>'}
    </div>`;
  }).join('')}</div>`;
}
