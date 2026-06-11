const STUDENT_SHEET_NAME = 'Student Info';
const STUDENT_SYNC_INTERVAL = 60000;
const WORKER_URL = 'https://lucse62b-api.sy164425.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
  updateTodayDate();
  initStudentDirectory();
});

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

  // Demo users must not receive real student data
  try {
    const raw = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
    if (raw) {
      const u = JSON.parse(raw);
      if (u.isDemo || String(u.id || '').toUpperCase() === 'DEMO') {
        renderStudentMessage(container, 'Student directory is not available in demo mode.', 'student-error');
        note.textContent = 'Demo mode — real student data is restricted.';
        return;
      }
    }
  } catch(e) {}

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

function loadGoogleSheet(sheetName) {
  return fetch(WORKER_URL + '/sheet?name=' + encodeURIComponent(sheetName))
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
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
  const frag = document.createDocumentFragment();

  const demoMode = (() => {
    try {
      const raw = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
      if (raw) {
        const u = JSON.parse(raw);
        return !!(u.isDemo || String(u.id || '').toUpperCase() === 'DEMO');
      }
    } catch(e) {}
    return false;
  })();

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
    group.rows.forEach((rowValues, rowIndex) => {
      const tr = document.createElement('tr');

      rowValues.forEach((value, index) => {
        const td = document.createElement('td');
        let displayValue = normalizeWhitespace(value);

        if (demoMode) {
          const headerText = String(group.headers[index] || '').toLowerCase().trim();
          if (headerText === '#' || headerText === 'sl' || headerText === 'sl.' || headerText.includes('serial')) {
            // Keep the original serial number
          } else if (headerText.includes('name')) {
            displayValue = `Student ${rowIndex + 1}`;
          } else if (headerText.includes('id')) {
            displayValue = `018232001210${String(1000 + rowIndex + 1).slice(1)}`;
          } else if (headerText.includes('phone') || headerText.includes('mobile') || headerText.includes('number') || headerText.includes('contact')) {
            displayValue = `01700000${String(100 + rowIndex).slice(1)}`;
          } else if (headerText.includes('email')) {
            displayValue = `student${rowIndex + 1}@lus.ac.bd`;
          } else if (headerText.includes('blood')) {
            displayValue = ['A+', 'B+', 'O+', 'AB+', 'O-'][rowIndex % 5];
          } else if (headerText.includes('address') || headerText.includes('location')) {
            displayValue = 'Sylhet, Bangladesh';
          } else {
            displayValue = 'Restricted';
          }
        }

        td.textContent = displayValue;
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
    frag.appendChild(section);
  });

  container.innerHTML = '';
  container.appendChild(frag);
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
