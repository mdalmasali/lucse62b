/* ── Website/pages/info/teachers.js ── */

const _TC_SUPA_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _TC_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

const _tcEmpty = v => !v || String(v).trim() === '' || String(v).trim() === '-' || String(v).trim().toLowerCase() === 'n/a';

async function loadTeachers(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Teachers & Courses...</div>';
    try {
        const [cpgCourseData, cpgTeacherData] = await Promise.all([
            fetchSheet('CPG_Courses'),
            fetchSheet('CPG_Teachers').catch(() => null),
        ]);

        /* ── Step 1: Build teacher map from CPG_Teachers (primary — has correct phone/email) ── */
        const teacherMap  = new Map(); /* key: lowercase name */
        const initialsMap = {};        /* key: uppercase initials → lowercase name key */

        if (cpgTeacherData?.table) {
            const tRows  = cpgTeacherData.table.rows || [];
            const hCells = (cpgTeacherData.table.cols || [])
                .map(c => (c?.label != null ? String(c.label).trim().toLowerCase() : ''));

            let initCol = hCells.findIndex(h => /initial|abbr|short|code|acronym/.test(h));
            let nameCol = hCells.findIndex(h => /name|teacher/.test(h));
            const deCol = hCells.findIndex(h => /designation/.test(h));
            const dpCol = hCells.findIndex(h => /department/.test(h));
            const phCol = hCells.findIndex(h => /phone|cell/.test(h));
            const emCol = hCells.findIndex(h => /email/.test(h));

            /* Content-based fallback if cols labels are empty */
            if (initCol < 0 || nameCol < 0) {
                const sample = tRows.slice(0, 5).map(r => (r.c || []).map(c => c?.v != null ? String(c.v).trim() : ''));
                for (let col = 0; col < (sample[0]?.length || 0); col++) {
                    const vals = sample.map(r => r[col]).filter(Boolean);
                    if (vals.length && vals.every(v => /^[A-Z]{2,5}$/.test(v)) && initCol < 0) initCol = col;
                    if (vals.length && vals.some(v => v.length > 5 && /\s/.test(v)) && nameCol < 0) nameCol = col;
                }
            }

            if (initCol >= 0 && nameCol >= 0) {
                tRows.forEach(row => {
                    const cells = (row.c || []).map(c => c?.v != null ? String(c.v).trim() : '');
                    const init  = cells[initCol]?.toUpperCase();
                    const name  = cells[nameCol];
                    if (!init || !name) return;

                    const key = name.toLowerCase().trim();
                    teacherMap.set(key, {
                        name,
                        designation: deCol >= 0 ? (cells[deCol] || '') : '',
                        department:  dpCol >= 0 ? (cells[dpCol] || '') : '',
                        phone:       phCol >= 0 ? (cells[phCol] || '') : '',
                        email:       emCol >= 0 ? (cells[emCol] || '') : '',
                        initials:    init,
                        courses:     [],
                    });
                    initialsMap[init] = key;
                });
            }
        }

        /* ── Step 2: Detect CPG_Courses columns and add courses to teachers ── */
        const rows = sheetRows(cpgCourseData);
        if (rows.length > 0 || teacherMap.size > 0) {
            let headers   = (cpgCourseData.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
            let startIndex = 0;

            if (!headers.some(h => h.includes('title') || h.includes('code') || h.includes('name'))) {
                headers    = rows[0]?.map(h => (h || '').toLowerCase().trim()) || [];
                startIndex = 1;
            }

            const tI  = headers.findIndex(h => h.includes('title'))       > -1 ? headers.findIndex(h => h.includes('title'))       : 0;
            const cI  = headers.findIndex(h => h.includes('code'))        > -1 ? headers.findIndex(h => h.includes('code'))        : 1;
            const nI  = headers.findIndex(h => h.includes('teacher name') || h === 'name') > -1 ? headers.findIndex(h => h.includes('teacher name') || h === 'name') : 2;
            const deI = headers.findIndex(h => h.includes('designation')) > -1 ? headers.findIndex(h => h.includes('designation')) : 3;
            const dpI = headers.findIndex(h => h.includes('department'))  > -1 ? headers.findIndex(h => h.includes('department'))  : 4;
            const pI  = headers.findIndex(h => h.includes('phone'))       > -1 ? headers.findIndex(h => h.includes('phone'))       : 5;
            const eI  = headers.findIndex(h => h.includes('email'))       > -1 ? headers.findIndex(h => h.includes('email'))       : 6;

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                const name = row[nI] || '';
                if (!name || name.toLowerCase() === 'tba' || name.toLowerCase() === 'tb a') continue;

                const key        = name.toLowerCase().trim();
                const courseInfo = { title: row[tI] || '', code: row[cI] || '' };
                if (!courseInfo.code) continue;

                if (teacherMap.has(key)) {
                    /* Already in map from CPG_Teachers — just add course */
                    const existing = teacherMap.get(key);
                    const dup = existing.courses.some(c => c.code === courseInfo.code);
                    if (!dup) existing.courses.push(courseInfo);
                } else {
                    /* Teacher not in CPG_Teachers — add from CPG_Courses data */
                    teacherMap.set(key, {
                        name,
                        designation: row[deI] || '',
                        department:  row[dpI] || '',
                        phone:       row[pI]  || '',
                        email:       row[eI]  || '',
                        courses:     [courseInfo],
                    });
                }
            }
        }

        if (teacherMap.size === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No teacher data found.</p></div>';
            return;
        }

        /* ── Step 3: Merge enrolled retake/improve courses for logged-in student ── */
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
                        const key = initialsMap[enr.teacher.toUpperCase()];
                        if (!key) return;

                        const enrolledCourse = {
                            title:    enr.course_name || enr.course_code || '',
                            code:     enr.course_code || '',
                            enrolled: enr.type,
                        };

                        if (teacherMap.has(key)) {
                            const existing  = teacherMap.get(key);
                            const alreadyHas = existing.courses.some(c => c.code === enr.course_code);
                            if (!alreadyHas && enrolledCourse.code) existing.courses.push(enrolledCourse);
                        }
                    });
                }
            } catch(e) { /* network error — silently skip */ }
        }

        /* ── Step 4: Render ── */
        const teachers = Array.from(teacherMap.values());

        /* Build suggestion list for autocomplete */
        const tcSuggestions = [];
        teachers.forEach(t => {
            tcSuggestions.push({ label: t.name, sub: t.designation || '', value: t.name });
            t.courses.forEach(c => {
                if (c.code) tcSuggestions.push({ label: c.code, sub: c.title, value: c.code });
            });
        });

        let cardsHtml = '';
        teachers.forEach(t => {
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
                    ${escH(c.title)}${badge}
                </div>`;
            }).join('');

            let phoneHtml = '<span style="color:#64748b;font-size:0.82rem;">N/A</span>';
            if (!_tcEmpty(t.phone)) {
                let cleanPhone = t.phone.replace(/[^0-9+]/g, '');
                if (cleanPhone.startsWith('01')) cleanPhone = '88' + cleanPhone;
                cleanPhone = cleanPhone.replace('+', '');
                phoneHtml = `
                    <span style="font-size:0.85rem;font-weight:600;">${escH(t.phone)}</span>
                    <a href="https://wa.me/${cleanPhone}" target="_blank"
                        style="margin-left:6px;color:#25D366;font-size:1rem;" title="WhatsApp">
                        <i class="fa-brands fa-whatsapp"></i>
                    </a>`;
            }

            cardsHtml += `
                <div class="info-item-card tc-card" data-search="${escH(searchText)}" style="display:flex;flex-direction:column;">
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
                            <i class="fa-solid fa-phone" style="width:18px;opacity:0.5;"></i> ${phoneHtml}
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

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
                <span id="tcCountLabel" style="flex:1;font-size:0.78rem;color:var(--text-secondary);">
                    ${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}
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
                        border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9999;">
                    </div>
                </div>
            </div>
            <div class="info-card-grid" id="tcGrid">${cardsHtml}</div>
            <div id="tcNoResult" style="display:none;padding:40px;text-align:center;
                color:var(--text-secondary);font-size:0.9rem;">No teachers found.</div>`;

        /* ── Search + autocomplete ── */
        const searchInput = body.querySelector('#tcSearchInput');
        const countLabel  = body.querySelector('#tcCountLabel');
        const grid        = body.querySelector('#tcGrid');
        const noResult    = body.querySelector('#tcNoResult');
        const dropdown    = body.querySelector('#tcDropdown');
        const cards       = grid.querySelectorAll('.tc-card');
        let acFocused = -1;

        function tcApplyFilter(q) {
            const lq = q.toLowerCase().trim();
            let visible = 0;
            cards.forEach(card => {
                const match = !lq || card.dataset.search.includes(lq);
                card.style.display = match ? '' : 'none';
                if (match) visible++;
            });
            countLabel.textContent = lq
                ? `${visible} of ${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`
                : `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`;
            noResult.style.display = visible === 0 ? '' : 'none';
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
                <div class="tc-ac-item" data-idx="${i}" data-value="${escH(s.value)}"
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
                    searchInput.value = item.dataset.value;
                    tcApplyFilter(item.dataset.value);
                    tcCloseDrop();
                });
            });
        }

        searchInput.addEventListener('input', () => {
            tcApplyFilter(searchInput.value);
            tcShowDrop(searchInput.value.trim());
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
