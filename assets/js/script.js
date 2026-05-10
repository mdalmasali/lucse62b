const STUDENT_SHEET_ID = 'REDACTED_SHEET_ID_FOR_SECURITY';
const STUDENT_SHEET_NAME = 'Student Info';
const STUDENT_SYNC_INTERVAL = 60000;

function isDemoMode() {
  try {
    const ud = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
    if (!ud) return false;
    const u = JSON.parse(ud);
    return !!(u.isDemo || String(u.id || '').toUpperCase() === 'DEMO');
  } catch { return false; }
}

function renderDemoStudents(container) {
  const firstNames = ['Abdur','Fatema','Mohammad','Nusrat','Rifat','Sumaiya','Shakib','Mim',
    'Mahfuz','Sadia','Nahid','Tania','Arif','Nasrin','Rasel','Kohinur',
    'Zahidul','Moonmoon','Mehedi','Lopa','Imran','Anika','Tanvir','Jannatul',
    'Sabbir','Riya','Mizan','Shila','Rakib','Setu','Liton','Dipa','Fahim','Mitu','Rony'];
  const lastNames = ['Rahman','Akter','Hossain','Jahan','Ahmed','Khanam','Islam','Begum',
    'Mia','Sultana','Billah','Nahar','Hassan','Khan','Chowdhury','Roy','Das','Paul'];
  const rows = [];
  for (let i = 0; i < 35; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3 + 7) % lastNames.length];
    const id = '018232001210' + String(1001 + i).slice(1);
    rows.push([`${fn} ${ln}`, id, 'CSE', '62nd', 'B']);
  }
  // Shuffle deterministically
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const groups = [{ title: 'CSE - 62B', headers: ['Name', 'Student ID', 'Dept', 'Batch', 'Section'], rows }];
  renderStudentGroups(container, groups);
}

document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  updateTodayDate();
  initStudentDirectory();
});

function createParticles() {
  const particlesContainer = document.getElementById('particles');
  if (!particlesContainer) {
    return;
  }

  for (let i = 0; i < 30; i += 1) {
    const particle = document.createElement('div');
    const size = Math.random() * 4 + 2;

    particle.classList.add('particle');
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}vw`;
    particle.style.background =
      Math.random() > 0.5 ? 'rgba(109,40,217,0.5)' : 'rgba(14,165,233,0.5)';
    particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
    particle.style.animationDelay = `${Math.random() * 5}s`;

    particlesContainer.appendChild(particle);
  }
}

function updateTodayDate() {
  const dateEl = document.getElementById('today-date');
  if (!dateEl) {
    return;
  }

  const options = { month: 'short', year: 'numeric' };
  dateEl.textContent = new Date().toLocaleDateString('en-US', options);
}

function initStudentDirectory() {
  const container = document.getElementById('student-sections');
  const note = document.getElementById('student-sheet-note');

  if (!container || !note) {
    return;
  }

  /* Demo mode: show randomised placeholder data */
  if (isDemoMode()) {
    updateStudentNote(note, '⚠️ Demo mode: Showing sample data only. Real student list is restricted.');
    renderDemoStudents(container);
    return;
  }

  let isLoading = false;
  let hasRendered = false;

  const syncSheet = async () => {
    if (isLoading) {
      return;
    }

    isLoading = true;

    try {
      const response = await loadGoogleSheet(STUDENT_SHEET_NAME);
      const groups = parseStudentSheet(response.table?.rows || []);

      if (!groups.length) {
        throw new Error('No student rows were found in the shared sheet.');
      }

      renderStudentGroups(container, groups);
      updateStudentNote(note, `Live sync from Google Sheet. Last checked ${formatSyncTime(new Date())}.`);
      hasRendered = true;
    } catch (error) {
      if (!hasRendered) {
        renderStudentMessage(container, 'Unable to load Google Sheet data right now.', 'student-error');
      }

      updateStudentNote(
        note,
        'Google Sheet sync is temporarily unavailable. Please refresh again shortly.',
        true
      );
      console.error(error);
    } finally {
      isLoading = false;
    }
  };

  syncSheet();
  window.setInterval(syncSheet, STUDENT_SYNC_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      syncSheet();
    }
  });
}

async function loadGoogleSheet(sheetName) {
  const SUPABASE_FUNC = 'https://ftvtlqxpalwvyserujuh.supabase.co/functions/v1/api-proxy?type=sheet&sheetName=' + encodeURIComponent(sheetName);
  const response = await fetch(SUPABASE_FUNC);
  if (!response.ok) throw new Error('Failed to load data from server.');
  return await response.json();
}

function parseStudentSheet(rows) {
  const groups = [];
  let currentGroup = null;

  rows.forEach((row) => {
    const values = trimTrailingEmptyCells((row.c || []).map(getCellValue));
    if (!values.length) {
      return;
    }

    if (values.length === 1) {
      if (currentGroup && currentGroup.headers.length) {
        groups.push(currentGroup);
      }

      currentGroup = {
        title: values[0],
        headers: [],
        rows: []
      };
      return;
    }

    if (!currentGroup) {
      return;
    }

    if (!currentGroup.headers.length) {
      currentGroup.headers = values;
      return;
    }

    const normalizedRow = currentGroup.headers.map((_, index) => values[index] || '');
    currentGroup.rows.push(normalizedRow);
  });

  if (currentGroup && currentGroup.headers.length) {
    groups.push(currentGroup);
  }

  return groups;
}

function renderStudentGroups(container, groups) {
  container.innerHTML = '';

  groups.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'student-group';

    const header = document.createElement('div');
    header.className = 'student-group-head';

    const title = document.createElement('h2');
    title.textContent = normalizeWhitespace(group.title);

    const count = document.createElement('span');
    count.textContent = `${group.rows.length} Students`;

    header.append(title, count);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    group.headers.forEach((headerText) => {
      const th = document.createElement('th');
      th.textContent = normalizeWhitespace(headerText);
      if (/course/i.test(headerText)) {
        th.classList.add('wide-column');
      }
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    group.rows.forEach((rowValues) => {
      const tr = document.createElement('tr');

      rowValues.forEach((value, index) => {
        const td = document.createElement('td');
        td.textContent = normalizeWhitespace(value);
        if (/course/i.test(group.headers[index] || '')) {
          td.classList.add('wide-column');
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    tableContainer.appendChild(table);
    section.append(header, tableContainer);
    container.appendChild(section);
  });
}

function renderStudentMessage(container, message, className) {
  container.innerHTML = '';

  const state = document.createElement('div');
  state.className = className;
  state.textContent = message;

  container.appendChild(state);
}

function updateStudentNote(note, message, isError = false) {
  note.textContent = message;
  note.classList.toggle('is-error', isError);
}

function formatSyncTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getCellValue(cell) {
  if (!cell || cell.v === null || typeof cell.v === 'undefined') {
    return '';
  }

  return String(cell.v);
}

function trimTrailingEmptyCells(values) {
  const trimmed = [...values];

  while (trimmed.length && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }

  return trimmed;
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
