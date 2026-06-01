/* ── Website/pages/info/teachers.js ── */

const _TC_SUPA_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _TC_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

const _tcEmpty = v => !v || String(v).trim() === '' || String(v).trim() === '-' || String(v).trim().toLowerCase() === 'n/a';

function _tcPhoneHtml(phone) {
    if (_tcEmpty(phone)) return '<span style="color:#64748b;font-size:0.82rem;">N/A</span>';
    // Normalize: strip separators, remove country prefix, restore leading zero
    let norm = String(phone).replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
    if      (norm.startsWith('880') && norm.length === 13) norm = '0' + norm.slice(3); // +8801X → 01X
    else if (norm.startsWith('88')  && norm.length === 12) norm = '0' + norm.slice(2); // 8801X → 01X
    else if (norm.startsWith('1')   && norm.length === 10) norm = '0' + norm;          // 1XXXXXXXXX → 01X (GVIZ drops leading 0)
    const waNum = norm.startsWith('01') && norm.length === 11 ? '88' + norm : norm;
    return `<span style="font-size:0.85rem;font-weight:600;">${escH(norm)}</span>
            <a href="https://wa.me/${waNum}" target="_blank"
                style="margin-left:6px;color:#25D366;font-size:1rem;" title="WhatsApp">
                <i class="fa-brands fa-whatsapp"></i></a>`;
}

async function loadTeachers(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Teachers & Courses...</div>';
    try {
        const [data, cpgTeacherData] = await Promise.all([
            fetchSheet('CPG_Courses').catch(() => null),
            fetchSheet('CPG_Teachers').catch(() => null),
        ]);

        /* CPG_Courses (the assigned-course list) may be empty — that's fine.
           The searchable directory comes from CPG_Teachers, so we still render
           the search UI even when no course has a teacher assigned yet. */
        const rows = data ? sheetRows(data) : [];

        /* ── Build full teacher directory from CPG_Teachers (for search + phone/email) ── */
        const directory   = {}; /* key: lowercase name → teacher info */
        const initialsMap = {}; /* key: uppercase initials → lowercase name */
        if (cpgTeacherData?.table) {
            const tRows  = cpgTeacherData.table.rows || [];
            const hCells = (cpgTeacherData.table.cols || [])
                .map(c => (c?.label != null ? String(c.label).trim().toLowerCase() : ''));

            let initCol = hCells.findIndex(h => /initial|abbr|short|code|acronym/.test(h));
            let nameCol = hCells.findIndex(h => /^name$|teacher/.test(h));
            let deCol   = hCells.findIndex(h => /designation/.test(h));
            let dpCol   = hCells.findIndex(h => /department/.test(h));
            let phCol   = hCells.findIndex(h => /phone|cell/.test(h));
            let emCol   = hCells.findIndex(h => /email/.test(h));

            /* Fallback: known CPG_Teachers column layout A=Acronym B=Name C=Designation D=Department E=Cell F=Email */
            if (initCol < 0) initCol = 0;
            if (nameCol < 0) nameCol = 1;
            if (deCol   < 0) deCol   = 2;
            if (dpCol   < 0) dpCol   = 3;
            if (phCol   < 0) phCol   = 4;
            if (emCol   < 0) emCol   = 5;

            if (initCol >= 0 && nameCol >= 0) {
                tRows.forEach(row => {
                    /* prefer c.f (formatted) so numbers keep leading zeros */
                    const cells = (row.c || []).map(c => {
                        if (!c) return '';
                        const fv = c.f != null ? String(c.f).trim() : '';
                        const vv = c.v != null ? String(c.v).trim() : '';
                        return fv || vv;
                    });
                    const init  = cells[initCol]?.toUpperCase().trim();
                    const name  = cells[nameCol];
                    if (!init || !name) return;
                    const key = name.toLowerCase().trim();
                    const prev = directory[key];
                    directory[key] = {
                        name,
                        designation: cells[deCol] || prev?.designation || '',
                        department:  cells[dpCol] || prev?.department  || '',
                        phone:       cells[phCol] || prev?.phone       || '',
                        email:       cells[emCol] || prev?.email       || '',
                    };
                    initialsMap[init] = key;
                });
            }

        }

        /* ── Build teacher map from CPG_Courses (what shows in the list) ── */
        let headers    = (data?.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (rows.length && !headers.some(h => h.includes('title') || h.includes('code') || h.includes('name'))) {
            headers    = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1;
        }

        const tI  = headers.findIndex(h => h.includes('title'))       > -1 ? headers.findIndex(h => h.includes('title'))       : 0;
        const cI  = headers.findIndex(h => h.includes('code'))        > -1 ? headers.findIndex(h => h.includes('code'))        : 1;
        const nI  = headers.findIndex(h => h.includes('teacher name') || h === 'name') > -1 ? headers.findIndex(h => h.includes('teacher name') || h === 'name') : 2;
        const deI = headers.findIndex(h => h.includes('designation')) > -1 ? headers.findIndex(h => h.includes('designation')) : 3;
        const dpI = headers.findIndex(h => h.includes('department'))  > -1 ? headers.findIndex(h => h.includes('department'))  : 4;
        const pI  = headers.findIndex(h => h.includes('phone'))       > -1 ? headers.findIndex(h => h.includes('phone'))       : 5;
        const eI  = headers.findIndex(h => h.includes('email'))       > -1 ? headers.findIndex(h => h.includes('email'))       : 6;

        const teacherMap = new Map();

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const name = row[nI] || '';
            if (!name || name.toLowerCase() === 'tba' || name.toLowerCase() === 'tb a') continue;
            const key        = name.toLowerCase().trim();
            const courseInfo = { title: row[tI] || '', code: row[cI] || '' };
            const dir        = directory[key]; /* use CPG_Teachers phone/email if available */

            if (!teacherMap.has(key)) {
                teacherMap.set(key, {
                    name,
                    designation: dir?.designation || row[deI] || '',
                    department:  dir?.department  || row[dpI] || '',
                    phone:       dir?.phone       || row[pI]  || '',
                    email:       dir?.email       || row[eI]  || '',
                    courses: courseInfo.code ? [courseInfo] : [],
                });
            } else if (courseInfo.code) {
                teacherMap.get(key).courses.push(courseInfo);
            }
        }

        /* ── Merge enrolled retake/improve teachers ── */
        const user = JSON.parse(
            localStorage.getItem('lu62b_student') ||
            sessionStorage.getItem('lu62b_student') ||
            'null'
        );
        if (user?.id) {
            try {
                const r = await fetch(
                    `${_TC_SUPA_URL}/rest/v1/student_retake_enrollments?student_id=eq.${encodeURIComponent(user.id)}&select=course_code,course_name,teacher,type`,
                    { headers: { 'apikey': _TC_SUPA_KEY, 'Authorization': `Bearer ${_TC_SUPA_KEY}` } }
                );
                if (r.ok) {
                    const enrollments = await r.json();
                    enrollments.forEach(enr => {
                        if (!enr.teacher) return;
                        const init = enr.teacher.toUpperCase();
                        const key  = initialsMap[init];
                        const info = key ? directory[key] : null;
                        if (!info) return;

                        const enrolledCourse = {
                            title:    enr.course_name || enr.course_code || '',
                            code:     enr.course_code || '',
                            enrolled: enr.type,
                        };

                        const bestPhone = info.phone || '';
                        const bestEmail = info.email || '';

                        if (teacherMap.has(key)) {
                            const existing   = teacherMap.get(key);
                            const alreadyHas = existing.courses.some(c => c.code === enr.course_code);
                            if (!alreadyHas && enrolledCourse.code) existing.courses.push(enrolledCourse);
                            if (!_tcEmpty(bestPhone)) existing.phone = bestPhone;
                            if (!_tcEmpty(bestEmail)) existing.email = bestEmail;
                        } else {
                            teacherMap.set(key, {
                                name:        info.name,
                                designation: info.designation,
                                department:  info.department,
                                phone:       bestPhone,
                                email:       bestEmail,
                                courses:     enrolledCourse.code ? [enrolledCourse] : [],
                                isEnrolledOnly: true,
                            });
                        }
                    });
                }
            } catch(e) { /* silently skip */ }
        }

        const teachers = Array.from(teacherMap.values());
        const dirCount = Object.keys(directory).length;
        /* Only a true dead-end when BOTH the course list and the teacher
           directory are empty. If the directory has teachers we still render
           the search UI so any teacher can be looked up. */
        if (!teachers.length && !dirCount) {
            body.innerHTML = '<div class="info-placeholder"><p>No teacher data found.</p></div>';
            return;
        }

        /* ── Render cards ── */
        let cardsHtml = '';
        teachers.forEach(t => {
            const tKey = t.name.toLowerCase().trim();
            const searchText = [t.name, t.designation, t.department, ...t.courses.map(c => c.code + ' ' + c.title)]
                .join(' ').toLowerCase();

            const coursesHtml = t.courses.map(c => {
                let badge = '';
                if (c.enrolled === 'retake') {
                    badge = `<span style="margin-left:6px;font-size:0.58rem;font-weight:800;padding:1px 6px;
                        border-radius:4px;background:rgba(244,63,94,.18);color:#f43f5e;
                        border:1px solid rgba(244,63,94,.3);letter-spacing:0.04em;
                        vertical-align:middle;">RETAKE</span>`;
                } else if (c.enrolled === 'improve') {
                    badge = `<span style="margin-left:6px;font-size:0.58rem;font-weight:800;padding:1px 6px;
                        border-radius:4px;background:rgba(251,146,60,.18);color:#fb923c;
                        border:1px solid rgba(251,146,60,.3);letter-spacing:0.04em;
                        vertical-align:middle;">IMPROVE</span>`;
                }
                return `<div style="font-size:0.72rem;background:rgba(124,58,237,0.1);
                    border:1px solid rgba(124,58,237,0.2);padding:4px 8px;border-radius:6px;
                    color:var(--text);margin-bottom:4px;">
                    <strong style="color:var(--accent-bright);">${escH(c.code)}:</strong>
                    ${escH(c.title)}${badge}</div>`;
            }).join('');

            cardsHtml += `
                <div class="info-item-card tc-card" data-search="${escH(searchText)}" data-name="${escH(tKey)}" style="display:flex;flex-direction:column;">
                    <div style="margin-bottom:12px;">
                        <div style="font-size:1.05rem;font-weight:700;color:var(--text);">${escH(t.name)}</div>
                        ${t.designation ? `<div style="font-size:0.78rem;color:var(--accent-bright);font-weight:600;margin-bottom:2px;">${escH(t.designation)}</div>` : ''}
                        ${t.department  ? `<div style="font-size:0.7rem;color:var(--text-secondary);opacity:0.8;">${escH(t.department)}</div>` : ''}
                    </div>
                    ${coursesHtml ? `
                    <div style="margin-bottom:12px;">
                        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;
                            color:var(--text-secondary);margin-bottom:6px;font-weight:700;">Assigned Courses</div>
                        ${coursesHtml}
                    </div>` : ''}
                    <div style="margin-top:auto;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.8rem;margin-bottom:5px;">
                            <i class="fa-solid fa-phone" style="width:18px;opacity:0.5;"></i> ${_tcPhoneHtml(t.phone)}
                        </div>
                        <div style="font-size:0.8rem;word-break:break-all;">
                            <i class="fa-solid fa-envelope" style="width:18px;opacity:0.5;"></i>
                            ${!_tcEmpty(t.email)
                                ? `<a href="mailto:${t.email}" style="color:var(--accent-bright);text-decoration:none;">${escH(t.email)}</a>`
                                : '<span style="color:#64748b;">N/A</span>'}
                        </div>
                    </div>
                </div>`;
        });

        /* ── Autocomplete suggestions from ALL CPG_Teachers ── */
        const tcSuggestions = Object.values(directory).map(t => ({
            label: t.name,
            sub:   t.designation || '',
            key:   t.name.toLowerCase().trim(),
        }));

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
                <span id="tcCountLabel" style="flex:1;font-size:0.78rem;color:var(--text-secondary);">
                    ${teachers.length
                        ? `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`
                        : `<i class="fa-solid fa-magnifying-glass" style="margin-right:5px;opacity:0.5;"></i>Search any of ${dirCount} teachers`}
                </span>
                <div style="position:relative;" id="tcSearchWrap">
                    <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:10px;top:50%;
                        transform:translateY(-50%);opacity:0.4;font-size:0.78rem;pointer-events:none;z-index:1;"></i>
                    <input id="tcSearchInput" type="text" placeholder="Search teachers or courses…"
                        autocomplete="off"
                        style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                        border-radius:8px;padding:7px 12px 7px 30px;color:var(--text);font-size:0.82rem;
                        outline:none;width:230px;transition:border-color .2s;"
                        onfocus="this.style.borderColor='var(--accent-bright)'"
                        onblur="this.style.borderColor='rgba(255,255,255,0.12)'" />
                    <div id="tcDropdown" style="display:none;position:absolute;top:calc(100% + 5px);right:0;
                        min-width:260px;max-height:260px;overflow-y:auto;
                        background:#1a1a2e;border:1px solid rgba(124,58,237,0.35);
                        border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9999;"></div>
                </div>
            </div>
            <!-- directory lookup result (shown when searched teacher not in current list) -->
            <div id="tcDirResult" style="display:none;margin-bottom:16px;
                border:1px solid rgba(124,58,237,0.3);border-radius:12px;
                background:rgba(124,58,237,0.07);padding:16px 20px;">
                <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.06em;
                    color:var(--accent-bright);font-weight:700;margin-bottom:10px;">
                    <i class="fa-solid fa-address-card" style="margin-right:6px;"></i>Teacher Directory Result
                </div>
                <div id="tcDirContent"></div>
            </div>
            <div class="info-card-grid" id="tcGrid">${cardsHtml}</div>
            ${!teachers.length ? `
            <div id="tcEmptyHint" style="padding:40px 20px;text-align:center;color:var(--text-secondary);font-size:0.85rem;">
                <i class="fa-solid fa-chalkboard-user" style="opacity:0.25;font-size:2rem;display:block;margin-bottom:12px;"></i>
                No course teachers assigned yet.<br>
                <span style="font-size:0.78rem;opacity:0.8;">Type a name above to look up any teacher's contact.</span>
            </div>` : ''}
            <div id="tcNoResult" style="display:none;padding:40px;text-align:center;
                color:var(--text-secondary);font-size:0.9rem;">No teachers found.</div>`;

        const searchInput = body.querySelector('#tcSearchInput');
        const countLabel  = body.querySelector('#tcCountLabel');
        const grid        = body.querySelector('#tcGrid');
        const noResult    = body.querySelector('#tcNoResult');
        const dropdown    = body.querySelector('#tcDropdown');
        const dirResult   = body.querySelector('#tcDirResult');
        const dirContent  = body.querySelector('#tcDirContent');
        const cards       = grid.querySelectorAll('.tc-card');
        let acFocused = -1;

        const emptyHint = body.querySelector('#tcEmptyHint');

        /* One directory contact card's inner HTML (name, role, phone, email) */
        function tcDirCardInner(t) {
            return `
                <div style="font-size:1.05rem;font-weight:700;color:var(--text);margin-bottom:4px;">${escH(t.name)}</div>
                ${t.designation ? `<div style="font-size:0.78rem;color:var(--accent-bright);font-weight:600;margin-bottom:2px;">${escH(t.designation)}</div>` : ''}
                ${t.department  ? `<div style="font-size:0.7rem;color:var(--text-secondary);opacity:0.8;margin-bottom:10px;">${escH(t.department)}</div>` : ''}
                <div style="font-size:0.8rem;margin-bottom:5px;">
                    <i class="fa-solid fa-phone" style="width:18px;opacity:0.5;"></i> ${_tcPhoneHtml(t.phone)}
                </div>
                <div style="font-size:0.8rem;word-break:break-all;">
                    <i class="fa-solid fa-envelope" style="width:18px;opacity:0.5;"></i>
                    ${!_tcEmpty(t.email)
                        ? `<a href="mailto:${t.email}" style="color:var(--accent-bright);text-decoration:none;">${escH(t.email)}</a>`
                        : '<span style="color:#64748b;">N/A</span>'}
                </div>`;
        }

        function tcApplyFilter(q) {
            const lq = q.toLowerCase().trim();
            let visible = 0;
            const inGrid = new Set();
            cards.forEach(card => {
                const match = !lq || card.dataset.search.includes(lq);
                card.style.display = match ? '' : 'none';
                if (match) { visible++; inGrid.add(card.dataset.name); }
            });

            /* Search the full CPG_Teachers directory for matches not already in
               the grid — so ANY teacher is findable even with no course assigned. */
            let dirMatches = [];
            if (lq.length >= 2) {
                dirMatches = Object.entries(directory)
                    .filter(([key, t]) => !inGrid.has(key)
                        && `${t.name} ${t.designation} ${t.department}`.toLowerCase().includes(lq))
                    .map(([, t]) => t)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .slice(0, 12);
            }
            if (dirMatches.length) {
                dirContent.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${
                    dirMatches.map(t => `
                    <div style="border:1px solid rgba(124,58,237,0.18);border-radius:10px;
                        background:rgba(255,255,255,0.02);padding:12px 14px;">${tcDirCardInner(t)}</div>`).join('')
                }</div>`;
                dirResult.style.display = '';
            } else {
                dirContent.innerHTML = '';
                dirResult.style.display = 'none';
            }

            if (emptyHint) emptyHint.style.display = (lq || dirMatches.length) ? 'none' : '';

            countLabel.innerHTML = lq
                ? `${visible + dirMatches.length} match${(visible + dirMatches.length) !== 1 ? 'es' : ''}`
                : (teachers.length
                    ? `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`
                    : `<i class="fa-solid fa-magnifying-glass" style="margin-right:5px;opacity:0.5;"></i>Search any of ${dirCount} teachers`);

            noResult.style.display = (visible === 0 && dirMatches.length === 0 && lq) ? '' : 'none';
            grid.style.display     = visible === 0 ? 'none' : '';
        }

        function tcCloseDrop() {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            acFocused = -1;
        }

        function tcShowDrop(q) {
            if (!q || q.length < 1) { tcCloseDrop(); return; }
            const lq   = q.toLowerCase();
            const hits = tcSuggestions.filter(s =>
                s.label.toLowerCase().includes(lq) || s.sub.toLowerCase().includes(lq)
            ).slice(0, 8);
            if (!hits.length) { tcCloseDrop(); return; }

            dropdown.innerHTML = hits.map((s, i) => `
                <div class="tc-ac-item" data-idx="${i}" data-key="${escH(s.key)}" data-label="${escH(s.label)}"
                    style="padding:8px 12px;cursor:pointer;display:flex;flex-direction:column;gap:1px;
                    border-bottom:1px solid rgba(255,255,255,0.05);transition:background .15s;">
                    <span style="font-size:0.83rem;font-weight:600;color:var(--text);">${escH(s.label)}</span>
                    ${s.sub ? `<span style="font-size:0.7rem;color:var(--text-secondary);opacity:0.75;">${escH(s.sub)}</span>` : ''}
                </div>`).join('');
            dropdown.style.display = 'block';
            acFocused = -1;

            dropdown.querySelectorAll('.tc-ac-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    dropdown.querySelectorAll('.tc-ac-item').forEach(el => el.style.background = '');
                    item.style.background = 'rgba(124,58,237,0.18)';
                });
                item.addEventListener('mouseleave', () => { item.style.background = ''; });
                item.addEventListener('mousedown', e => {
                    e.preventDefault();
                    const label = item.dataset.label;
                    searchInput.value = label;
                    /* tcApplyFilter handles both grid + directory lookup */
                    tcApplyFilter(label);
                    tcCloseDrop();
                });
            });
        }

        searchInput.addEventListener('input', () => {
            const q = searchInput.value;
            tcApplyFilter(q);
            tcShowDrop(q.trim());
        });

        searchInput.addEventListener('keydown', e => {
            const items = dropdown.querySelectorAll('.tc-ac-item');
            if (!items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                acFocused = Math.min(acFocused + 1, items.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                acFocused = Math.max(acFocused - 1, 0);
            } else if (e.key === 'Enter' && acFocused >= 0) {
                e.preventDefault();
                items[acFocused].dispatchEvent(new MouseEvent('mousedown'));
                return;
            } else if (e.key === 'Escape') {
                tcCloseDrop(); return;
            } else { return; }
            items.forEach((el, i) => {
                el.style.background = i === acFocused ? 'rgba(124,58,237,0.18)' : '';
            });
        });

        searchInput.addEventListener('blur', () => setTimeout(tcCloseDrop, 150));
        document.addEventListener('click', e => {
            if (!body.querySelector('#tcSearchWrap')?.contains(e.target)) tcCloseDrop();
        }, { capture: true });

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error loading teacher data.</p></div>';
    }
}
