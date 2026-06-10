/* ── Website/pages/info/group-links.js ── */

function _glCopyCode(btn, code) {
    navigator.clipboard.writeText(code).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        btn.style.color = '#34d399';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1600);
    }).catch(() => {});
}

async function loadGroupLinks(body) {
    body.innerHTML = `<div class="info-loading-spin"><div class="spin-sm"></div> Loading Links &amp; Codes...</div>`;

    try {
        const routinePromise = (typeof _allDayResults !== 'undefined' && _allDayResults)
            ? Promise.resolve(_allDayResults)
            : (typeof fetchAllRoutineDays === 'function' ? fetchAllRoutineDays().catch(() => null) : Promise.resolve(null));

        const [cpgData, sem, cpgTeacherData, dayResults] = await Promise.all([
            fetchSheet('CPG_Courses'),
            getSemesterLabel(),
            fetchSheet('CPG_Teachers').catch(() => null),
            routinePromise,
        ]);

        const rows = sheetRows(cpgData);

        if (!rows || rows.length === 0) {
            body.innerHTML = `<div class="info-placeholder"><i class="fa-solid fa-link"></i><p>No group links available yet.</p></div>`;
            return;
        }

        // Build teacher lookup from CPG_Teachers
        const directory = {};
        const initialsMap = {};
        if (cpgTeacherData) {
            const tRows = sheetRows(cpgTeacherData);
            const tStart = (tRows[0] && (tRows[0][0] || '').toLowerCase().includes('acronym')) ? 1 : 0;
            for (let i = tStart; i < tRows.length; i++) {
                const tr = tRows[i];
                const initials = (tr[0] || '').trim().toUpperCase();
                const name = (tr[1] || '').trim();
                if (!initials || !name) continue;
                const key = name.toLowerCase();
                directory[key] = { name };
                initialsMap[initials] = key;
            }
        }

        // Build course code → teacher name map from Batch 62B routine
        const courseTeacherMap = {};
        if (dayResults) {
            (typeof ROUTINE_DAY_NAMES !== 'undefined' ? ROUTINE_DAY_NAMES : []).forEach((dayName, idx) => {
                const dayData = dayResults[idx];
                if (!dayData?.table) return;
                const dayRows = dayData.table.rows || [];
                const cols    = dayData.table.cols || [];

                let dataStart = 0;
                const colTimes = cols.slice(3).map(c => (c.label || '').trim());
                if (!colTimes.some(t => /\d+:\d+/.test(t))) {
                    for (let r = 0; r < Math.min(dayRows.length, 3); r++) {
                        const cells = (dayRows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
                        if (cells.slice(3).some(c => /\d+:\d+/.test(c))) { dataStart = r + 1; break; }
                    }
                }

                for (let r = dataStart; r < dayRows.length; r++) {
                    const cells = (dayRows[r].c || []).map(c => c?.v != null ? String(c.v).trim() : '');
                    const rowBatch = String(cells[1]?.trim() || '').replace(/\.0+$/, '');
                    if (rowBatch !== '62' || cells[2]?.trim().toUpperCase() !== 'B') continue;

                    cells.slice(3).forEach(cell => {
                        const parsed = typeof parseClassCell === 'function' ? parseClassCell(cell) : null;
                        if (!parsed?.code) return;
                        const initials = (parsed.initials || '').toUpperCase().trim();
                        if (!initials || initials === 'BREAK') return;
                        const code = parsed.code.trim().toUpperCase();
                        if (courseTeacherMap[code]) return;
                        const dirKey = initialsMap[initials];
                        courseTeacherMap[code] = dirKey ? directory[dirKey].name : initials;
                    });
                }
            });
        }

        const cards = [];

        const firstCode = (rows[0] && rows[0][1]) ? rows[0][1].toLowerCase().trim() : '';
        const startIdx  = (firstCode === 'code' || firstCode === 'course code') ? 1 : 0;

        for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const title      = row[0]  || '';
            const courseCode = row[1]  || '';
            const codeUp     = courseCode.trim().toUpperCase();
            const teacher    = courseTeacherMap[codeUp] || row[4] || 'TBA';
            const waLink     = row[9]  || '';
            const gcLink     = row[10] || '';
            const gcCode     = row[11] || '';

            if (!waLink && !gcLink && !gcCode) continue;

            const color = typeof courseColor === 'function' ? courseColor(courseCode) : '#a78bfa';
            const hasGcCode = gcCode && gcCode !== '-';
            const hasWa     = waLink && waLink !== '-';
            const hasGc     = gcLink && gcLink !== '-';

            const gcCodeSafe = gcCode.replace(/'/g, "\\'");

            cards.push(`
                <div class="gl-card" style="border-top:3px solid ${color};">
                    <div>
                        <div class="gl-course-code" style="color:${color};background:${color}1a;">${escH(courseCode)}</div>
                        <div class="gl-course-title">${escH(title)}</div>
                        <div class="gl-teacher">
                            <i class="fa-solid fa-chalkboard-user"></i>
                            ${escH(teacher)}
                        </div>
                    </div>

                    ${hasGcCode ? `
                    <button class="gl-code-btn" onclick="_glCopyCode(this,'${gcCodeSafe}')">
                        <span style="opacity:0.55;font-size:0.68rem;">Classroom Code</span>
                        <span class="gl-code-val">${escH(gcCode)}</span>
                        <i class="fa-regular fa-copy" style="margin-left:auto;opacity:0.45;font-size:0.75rem;"></i>
                    </button>` : ''}

                    <div class="gl-btn-row">
                        ${hasWa ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="gl-btn gl-btn-wa">
                            <i class="fa-brands fa-whatsapp"></i> WhatsApp
                        </a>` : ''}
                        ${hasGc ? `<a href="${gcLink}" target="_blank" rel="noopener noreferrer" class="gl-btn gl-btn-gc">
                            <i class="fa-solid fa-graduation-cap"></i> Classroom
                        </a>` : ''}
                    </div>
                </div>
            `);
        }

        if (!cards.length) {
            body.innerHTML = `<div class="info-placeholder"><i class="fa-solid fa-link"></i><p>No links or codes available yet.</p></div>`;
            return;
        }

        body.innerHTML = `
            <div class="rt-sync">
                <div class="rt-sync-dot"></div>
                <span>${escH(sem)} &nbsp;·&nbsp; Batch 62, Section B</span>
            </div>
            <div class="info-card-grid">${cards.join('')}</div>`;

    } catch (err) {
        console.error('Group Link Error:', err);
        body.innerHTML = `<div class="info-placeholder"><p>Error fetching links and codes.</p></div>`;
    }
}
