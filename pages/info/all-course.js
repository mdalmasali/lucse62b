/* ─── All Batch Course Offer ─── */
/* Globals from info.html: fetchSheet, getSemesterLabel, escH */

async function loadAllCourse(body) {
  body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading course offer...</div>';

  let batches = {};
  let batchOrder = [];

  try {
    const [data, sem] = await Promise.all([fetchSheet('LU_Course_Offer'), getSemesterLabel()]);

    const rows = (data.table?.rows || []).map(r =>
      (r.c || []).map(c => {
        if (!c) return '';
        if (c.f != null && c.f !== '') return String(c.f).trim();
        if (c.v == null) return '';
        return String(c.v).trim();
      })
    );

    if (!rows.length) {
      body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-layer-group"></i><p>No course data found.</p></div>';
      return;
    }

    // Skip header if present
    const firstVal = rows[0] && rows[0][0] ? rows[0][0].toLowerCase().trim() : '';
    const startIdx = (firstVal === 'batch' || firstVal === 'semester') ? 1 : 0;
    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || !r[1]) continue;
      const batch = r[0].trim();
      const course = {
        code:  r[1]?.trim() || '',
        title: r[2]?.trim() || '',
        credit: r[3]?.trim() || '',
        section: r[4]?.trim() || '',
        prereq: r[5]?.trim() || '',
      };
      if (!batches[batch]) { batches[batch] = []; batchOrder.push(batch); }
      batches[batch].push(course);
    }

    if (!batchOrder.length) {
      body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-layer-group"></i><p>No course data found.</p></div>';
      return;
    }

    const defaultBatch = batchOrder.includes('62') ? '62' : batchOrder[0];

    body.innerHTML = `
      <div class="rt-sync">
        <div class="rt-sync-dot"></div>
        <span>All Batch Course Offer &nbsp;·&nbsp; ${escH(sem)}</span>
      </div>
      <div id="ac-chip-bar" class="ac-chip-bar"></div>
      <div id="ac-table-wrap"></div>`;

    // Render batch chips
    const chipBar = document.getElementById('ac-chip-bar');
    batchOrder.forEach(batch => {
      const chip = document.createElement('button');
      chip.className = 'ac-chip' + (batch === defaultBatch ? ' ac-chip-active' : '');
      chip.textContent = 'Batch ' + batch;
      chip.onclick = () => {
        document.querySelectorAll('.ac-chip').forEach(c => c.classList.remove('ac-chip-active'));
        chip.classList.add('ac-chip-active');
        renderBatchTable(batch);
      };
      chipBar.appendChild(chip);
    });

    renderBatchTable(defaultBatch);

  } catch (err) {
    body.innerHTML = `<div class="info-placeholder">
      <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;opacity:0.4;"></i>
      <p style="color:#f87171;font-weight:600;">Could not load course offer.</p>
      <p style="font-size:0.78rem;margin-top:6px;">${err.message}</p>
    </div>`;
  }

  function renderBatchTable(batch) {
    const wrap = document.getElementById('ac-table-wrap');
    if (!wrap) return;
    const courses = batches[batch] || [];
    const totalCredits = courses.reduce((s, c) => s + (parseFloat(c.credit) || 0), 0);

    let retakeCodes = new Set(), improveCodes = new Set();
    try {
      JSON.parse(localStorage.getItem('lu62b_retake_codes')  || '[]').forEach(x => retakeCodes.add(x));
      JSON.parse(localStorage.getItem('lu62b_improve_codes') || '[]').forEach(x => improveCodes.add(x));
    } catch(e) {}

    const myRetakeCount  = courses.filter(c => retakeCodes.has((c.code||'').trim().toUpperCase())).length;
    const myImproveCount = courses.filter(c => improveCodes.has((c.code||'').trim().toUpperCase())).length;
    const myBadges = [
      myRetakeCount  ? `<span class="ac-retake-tag retake"><i class="fa-solid fa-xmark-circle"></i> ${myRetakeCount} Retake</span>`   : '',
      myImproveCount ? `<span class="ac-retake-tag improve"><i class="fa-solid fa-arrow-up"></i> ${myImproveCount} Improve</span>` : '',
    ].filter(Boolean).join(' ');

    let html = `
      <div class="ac-summary-bar">
        <span><i class="fa-solid fa-layer-group" style="color:var(--accent-bright);margin-right:6px;"></i>Batch <strong>${escH(batch)}</strong></span>
        <span><strong>${courses.length}</strong> courses &nbsp;·&nbsp; <strong>${totalCredits}</strong> total credits${myBadges ? ' &nbsp;·&nbsp; ' + myBadges : ''}</span>
      </div>
      <div class="ac-table-scroll">
      <table class="ac-table">
        <thead><tr>
          <th>#</th>
          <th>Code</th>
          <th>Course Title</th>
          <th>Cr.</th>
          <th>Sec</th>
          <th>Prerequisite</th>
        </tr></thead>
        <tbody>`;

    courses.forEach((c, idx) => {
      const codeUp  = (c.code || '').trim().toUpperCase();
      const isRetake  = retakeCodes.has(codeUp);
      const isImprove = improveCodes.has(codeUp);
      const rowClass  = isRetake ? 'ac-row-retake' : isImprove ? 'ac-row-improve' : '';
      const badge     = isRetake
        ? `<span class="ac-retake-tag retake">Retake</span>`
        : isImprove
          ? `<span class="ac-retake-tag improve">Improve</span>`
          : '';
      html += `<tr${rowClass ? ` class="${rowClass}"` : ''}>
        <td class="ac-td-num">${idx + 1}</td>
        <td><span class="ac-code">${escH(c.code)}</span>${badge}</td>
        <td class="ac-td-title">${escH(c.title)}</td>
        <td class="ac-td-cr">${escH(c.credit)}</td>
        <td class="ac-td-sec">${escH(c.section)}</td>
        <td class="ac-td-pre">${c.prereq ? escH(c.prereq) : '<span style="opacity:0.3;">—</span>'}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
  }
}
