/* ─── Teacher Class Routine ─── */
/* Globals from info.html: getRoutineSheetId, fetchSheet, fetchDayTab,
   ROUTINE_DAY_NAMES, sheetRows, parseClassCell, parseDayResults,
   deduplicateTimes, courseColor, escH, DAY_DISPLAY,
   _doDownloadImg, _doDownloadPDF */

let _teacherCache  = null;
let _trInitialsMap = {};   /* initials (upper) → full name */
let _trNameMap     = {};   /* normalised full name → initials */
let _trTeacherList = [];   /* [{name, desig, acronym}] for autocomplete */
let _trCourseInfo  = null; /* cached CPG_Courses */
let _trDayResults  = null; /* cached day tab results */
let _trDataLoaded  = false;

/* ── Autocomplete engine ── */
let _trAcEl = null, _trAcFocused = -1;

function _trAcInjectCSS() {
  if (document.getElementById('tr-ac-style')) return;
  const s = document.createElement('style');
  s.id = 'tr-ac-style';
  s.textContent = `
    .tr-ac-dropdown{position:fixed;background:#12122a;border:1px solid var(--accent);
      border-radius:10px;max-height:220px;overflow-y:auto;z-index:9999;
      box-shadow:0 10px 36px rgba(0,0,0,0.6);animation:trAcIn 0.12s ease;}
    @keyframes trAcIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
    .tr-ac-item{padding:9px 13px;cursor:pointer;font-size:0.83rem;color:var(--text);
      transition:background 0.1s;line-height:1.45;}
    .tr-ac-item:not(:last-child){border-bottom:1px solid rgba(255,255,255,0.05);}
    .tr-ac-item:hover,.tr-ac-item.tr-ac-focused{background:rgba(124,58,237,0.22);}
    .tr-ac-item strong{color:#c4b5fd;}
    .tr-ac-item small{color:var(--text-secondary);font-size:0.74rem;}`;
  document.head.appendChild(s);
}

function _trAcClose() {
  if (_trAcEl) { _trAcEl.remove(); _trAcEl = null; _trAcFocused = -1; }
}

function _trAcPos(inp) {
  if (!_trAcEl) return;
  const r = inp.getBoundingClientRect();
  _trAcEl.style.top   = (r.bottom + 2) + 'px';
  _trAcEl.style.left  = r.left + 'px';
  _trAcEl.style.width = r.width + 'px';
}

function _trAcSetup(inp) {
  _trAcInjectCSS();

  inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase().trim();
    _trAcClose();
    if (q.length < 1) return;
    const hits = _trTeacherList
      .filter(t => t.name.toLowerCase().includes(q) || t.acronym.toLowerCase().startsWith(q))
      .slice(0, 8);
    if (!hits.length) return;

    _trAcEl = document.createElement('div');
    _trAcEl.className = 'tr-ac-dropdown';
    _trAcFocused = -1;

    hits.forEach(t => {
      const div = document.createElement('div');
      div.className = 'tr-ac-item';
      div.innerHTML = `<strong>${escH(t.name)}</strong> <small style="color:#6366f1;font-weight:700;">(${escH(t.acronym)})</small>`
        + (t.desig ? `<br><small>${escH(t.desig)}</small>` : '');
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        inp.value = t.name;
        _trAcClose();
        /* Auto-trigger search on selection */
        doTeacherSearch();
      });
      _trAcEl.appendChild(div);
    });

    document.body.appendChild(_trAcEl);
    _trAcPos(inp);
  });

  inp.addEventListener('keydown', e => {
    if (!_trAcEl) return;
    const els = _trAcEl.querySelectorAll('.tr-ac-item');
    if      (e.key === 'ArrowDown') { e.preventDefault(); _trAcFocused = Math.min(_trAcFocused + 1, els.length - 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); _trAcFocused = Math.max(_trAcFocused - 1, 0); }
    else if (e.key === 'Enter' && _trAcFocused >= 0) { e.preventDefault(); els[_trAcFocused].dispatchEvent(new MouseEvent('mousedown')); return; }
    else if (e.key === 'Escape')    { _trAcClose(); return; }
    els.forEach((el, i) => el.classList.toggle('tr-ac-focused', i === _trAcFocused));
  });

  inp.addEventListener('blur', () => setTimeout(_trAcClose, 160));
  window.addEventListener('scroll', () => _trAcPos(inp), true);
  window.addEventListener('resize', () => _trAcPos(inp));
}

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
          placeholder="Initials or Name — e.g. NJN, Nargis Jahan"
          maxlength="80" style="min-width:220px;" />
        <button class="rt-tf-btn" id="teacherSearchBtn" onclick="doTeacherSearch()">
          <i class="fa-solid fa-magnifying-glass"></i> Generate Routine
        </button>
      </div>
      <div class="rt-tf-hint">
        Type initials or teacher name — suggestions will appear as you type.
      </div>
    </div>
    <div id="teacherRoutineResult"></div>`;

  const inp = document.getElementById('teacherInitialsInput');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') doTeacherSearch(); });

  /* Wire autocomplete if data already loaded; otherwise load+wire */
  if (_trDataLoaded) _trAcSetup(inp);
  else _trLoadTeacherData();
}

/* ── Background: build initials ↔ name maps from CPG_Teachers ── */
async function _trLoadTeacherData() {
  try {
    const teacherData = await fetchSheet('CPG_Teachers').catch(() => null);

    const initialsMap = {};
    const teacherList = [];

    if (teacherData) {
      /* CPG_Teachers columns: A=Acronym, B=Name, C=Designation, D=Department */
      sheetRows(teacherData).forEach(r => {
        const acronym = (r[0] || '').trim().toUpperCase();
        const name    = (r[1] || '').trim();
        const desig   = (r[2] || '').trim();
        if (acronym && name && !/^(name|acronym|initials)/i.test(acronym)) {
          initialsMap[acronym] = name;
          teacherList.push({ name, desig, acronym });
        }
      });
    }

    _trInitialsMap = initialsMap;
    _trTeacherList = teacherList.sort((a, b) => a.name.localeCompare(b.name));
    _trNameMap     = {};
    Object.entries(initialsMap).forEach(([ini, name]) => {
      _trNameMap[name.toLowerCase()] = ini;
    });
    _trDataLoaded = true;

    /* Wire autocomplete to input (may already be in DOM) */
    const inp = document.getElementById('teacherInitialsInput');
    if (inp) _trAcSetup(inp);
  } catch(e) {}
}

/* ── Resolve user input → initials ── */
function _trResolveInitials(raw) {
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

    if (!courseInfo || !dayResults) {
      const [cpgData, dr, s] = await Promise.all([
        fetchSheet('CPG_Courses').catch(() => null),
        fetchAllRoutineDays(),       /* merges Link 1 + any extra Routine Link N */
        getSemesterLabel(),
      ]);
      sem = s;

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

    const { schedule, dayTimeframes } = parseDayResults(dayResults, (cells, cell) => {
      const parsed = parseClassCell(cell);
      if (!parsed || parsed.initials.toUpperCase() !== initials) return null;
      return { batch: (cells[1] || '').replace(/\.0+$/, ''), section: (cells[2] || '').trim().toUpperCase() };
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

    const groups = buildTimeframeGroups(schedule, dayTimeframes);
    _teacherCache = { days, schedule, courseInfo, groups, dayTimeframes, initials, teacherFullName, semester: sem };

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
  const { schedule, groups } = _teacherCache;
  if (!groups || !groups.length) return '<div class="rt-grid-empty-msg">No schedule data found.</div>';

  const renderCourses = courses => courses.map(slot => {
    const color    = courseColor(slot.code);
    const batchSec = `${slot.batch || ''}${slot.section ? '-' + slot.section : ''}`;
    return `<div class="rt-gc" style="background:${color}12;border-color:${color}33;">
      <span class="rt-gc-code" style="color:${color};">${escH(slot.code)}</span>
      <span class="rt-gc-teacher">${escH(batchSec)}</span>
      ${slot.room ? `<span class="rt-gc-room">${escH(slot.room)}</span>` : ''}
    </div>`;
  }).join('');

  const tables = groups.map((g, gi) => routineTableHTML(g, schedule, todayName, renderCourses, gi)).join('');
  return `<div id="rt-teacher-capture" class="rt-capture-area"><div class="rt-grid-wrap">${tables}</div></div>`;
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
