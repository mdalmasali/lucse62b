/* ── Website/pages/info/teachers.js ── */

const _TC_SUPA_URL = 'https://ftvtlqxpalwvyserujuh.supabase.co';
const _TC_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

async function loadTeachers(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Teachers & Courses...</div>';
    try {
        /* Load CPG_Courses and CPG_Teachers sheets in parallel */
        const [data, cpgTeacherData] = await Promise.all([
            fetchSheet('CPG_Courses'),
            fetchSheet('CPG_Teachers').catch(() => null),
        ]);

        const rows = sheetRows(data);
        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No data found.</p></div>';
            return;
        }

        /* ── Detect column indices from CPG_Courses ── */
        let headers = (data.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (!headers.some(h => h.includes('title') || h.includes('code') || h.includes('name'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1;
        }

        const tI  = headers.findIndex(h => h.includes('title'))       > -1 ? headers.findIndex(h => h.includes('title'))       : 0;
        const cI  = headers.findIndex(h => h.includes('code'))        > -1 ? headers.findIndex(h => h.includes('code'))        : 1;
        const nI  = headers.findIndex(h => h.includes('teacher name') || h === 'name') > -1 ? headers.findIndex(h => h.includes('teacher name') || h === 'name') : 2;
        const deI = headers.findIndex(h => h.includes('designation')) > -1 ? headers.findIndex(h => h.includes('designation')) : 3;
        const dpI = headers.findIndex(h => h.includes('department'))  > -1 ? headers.findIndex(h => h.includes('department'))  : 4;
        const pI  = headers.findIndex(h => h.includes('phone'))       > -1 ? headers.findIndex(h => h.includes('phone'))       : 5;
        const eI  = headers.findIndex(h => h.includes('email'))       > -1 ? headers.findIndex(h => h.includes('email'))       : 6;

        /* ── Build teacher map from CPG_Courses ── */
        const teacherMap = new Map(); /* key: lowercase name */

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const name = row[nI] || '';
            if (!name || name.toLowerCase() === 'tba' || name.toLowerCase() === 'tb a') continue;
            const key = name.toLowerCase().trim();
            const courseInfo = { title: row[tI] || '', code: row[cI] || '' };
            if (!teacherMap.has(key)) {
                teacherMap.set(key, {
                    name,
                    designation: row[deI] || '',
                    department:  row[dpI] || '',
                    phone:       row[pI]  || '',
                    email:       row[eI]  || '',
                    courses: courseInfo.code ? [courseInfo] : [],
                });
            } else if (courseInfo.code) {
                teacherMap.get(key).courses.push(courseInfo);
            }
        }

        /* ── Build initials → teacher details map from CPG_Teachers ── */
        const initialsInfoMap = {}; /* initials → { name, designation, department, phone, email } */
        if (cpgTeacherData?.table) {
            const tRows = cpgTeacherData.table.rows || [];
            if (tRows.length > 1) {
                const hCells = (tRows[0].c || []).map(c => (c?.v != null ? String(c.v).trim().toLowerCase() : ''));
                let initCol = hCells.findIndex(h => /initial|abbr|short|code|acronym/.test(h));
                let nameCol = hCells.findIndex(h => /name|teacher/.test(h));
                const deCol = hCells.findIndex(h => /designation/.test(h));
                const dpCol = hCells.findIndex(h => /department/.test(h));
                const phCol = hCells.findIndex(h => /phone|cell/.test(h));
                const emCol = hCells.findIndex(h => /email/.test(h));

                /* Content-based fallback */
                if (initCol < 0 || nameCol < 0) {
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
                        const name = cells[nameCol];
                        if (init && name) {
                            initialsInfoMap[init] = {
                                name,
                                designation: deCol >= 0 ? (cells[deCol] || '') : '',
                                department:  dpCol >= 0 ? (cells[dpCol] || '') : '',
                                phone:       phCol >= 0 ? (cells[phCol] || '') : '',
                                email:       emCol >= 0 ? (cells[emCol] || '') : '',
                            };
                        }
                    });
                }
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
                        const initials = enr.teacher.toUpperCase();
                        const info = initialsInfoMap[initials];
                        if (!info) return;

                        const enrolledCourse = {
                            title:    enr.course_name || enr.course_code || '',
                            code:     enr.course_code || '',
                            enrolled: enr.type, /* 'retake' | 'improve' — triggers badge */
                        };

                        const key = info.name.toLowerCase().trim();
                        if (teacherMap.has(key)) {
                            /* Teacher already in list — add course if not duplicate */
                            const existing = teacherMap.get(key);
                            const alreadyHas = existing.courses.some(c => c.code === enr.course_code);
                            if (!alreadyHas && enrolledCourse.code) {
                                existing.courses.push(enrolledCourse);
                            }
                        } else {
                            /* New teacher — add from CPG_Teachers info */
                            teacherMap.set(key, {
                                name:        info.name,
                                designation: info.designation,
                                department:  info.department,
                                phone:       info.phone,
                                email:       info.email,
                                courses:     enrolledCourse.code ? [enrolledCourse] : [],
                                isEnrolledOnly: true,
                                initials,
                            });
                        }
                    });
                }
            } catch(e) { /* network error — silently skip */ }
        }

        /* ── Render ── */
        const teachers = Array.from(teacherMap.values());
        if (!teachers.length) {
            body.innerHTML = '<div class="info-placeholder"><p>No teacher data found.</p></div>';
            return;
        }

        let html = '<div class="info-card-grid">';
        teachers.forEach(t => {
            const coursesHtml = t.courses.map(c => {
                /* Badge for retake/improve enrolled courses */
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
            if (t.phone && t.phone !== '-' && t.phone.toLowerCase() !== 'n/a') {
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

            /* Badge shown on the card if teacher is only here due to enrollment */
            const enrolledOnlyBadge = t.isEnrolledOnly
                ? `<span style="font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:5px;
                    background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3);
                    letter-spacing:0.04em;display:inline-flex;align-items:center;gap:4px;margin-left:6px;
                    vertical-align:middle;">
                    <i class="fa-solid fa-list-check" style="font-size:0.55rem;"></i> Enrolled
                  </span>`
                : '';

            html += `
                <div class="info-item-card" style="display:flex;flex-direction:column;">
                    <div style="margin-bottom:12px;">
                        <div style="font-size:1.05rem;font-weight:700;color:var(--text);">
                            ${escH(t.name)}${enrolledOnlyBadge}
                        </div>
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
                            ${t.email && t.email !== '-'
                                ? `<a href="mailto:${t.email}" style="color:var(--accent-bright);text-decoration:none;">${escH(t.email)}</a>`
                                : '<span style="color:#64748b;">N/A</span>'}
                        </div>
                    </div>
                </div>`;
        });
        body.innerHTML = html + '</div>';

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error loading teacher data.</p></div>';
    }
}
