/* ── Website/pages/info/teachers.js ── */

async function loadTeachers(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Teachers & Courses...</div>';
    try {
        const data = await fetchSheet('CPG_Courses');
        const rows = sheetRows(data);
        
        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No data found.</p></div>';
            return;
        }

        // Same robust row checking for teachers
        let headers = (data.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (!headers.some(h => h.includes('title') || h.includes('code') || h.includes('name'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1; 
        }

        const tI = headers.findIndex(h => h.includes('title')) > -1 ? headers.findIndex(h => h.includes('title')) : 0;
        const cI = headers.findIndex(h => h.includes('code')) > -1 ? headers.findIndex(h => h.includes('code')) : 1;
        const nI = headers.findIndex(h => h.includes('teacher name') || h === 'name') > -1 ? headers.findIndex(h => h.includes('teacher name') || h === 'name') : 2;
        const deI = headers.findIndex(h => h.includes('designation')) > -1 ? headers.findIndex(h => h.includes('designation')) : 3;
        const dpI = headers.findIndex(h => h.includes('department')) > -1 ? headers.findIndex(h => h.includes('department')) : 4;
        const pI = headers.findIndex(h => h.includes('phone')) > -1 ? headers.findIndex(h => h.includes('phone')) : 5;
        const eI = headers.findIndex(h => h.includes('email')) > -1 ? headers.findIndex(h => h.includes('email')) : 6;

        const teacherMap = new Map();

        // Loop shuru hobe correct startIndex theke
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const name = row[nI] || '';
            if (!name || name.toLowerCase() === 'tba' || name.toLowerCase() === 'tb a') continue;

            const key = name.toLowerCase().trim();
            const courseInfo = {
                title: row[tI] || '',
                code: row[cI] || ''
            };

            if (!teacherMap.has(key)) {
                teacherMap.set(key, {
                    name: name,
                    designation: row[deI] || '',
                    department: row[dpI] || '',
                    phone: row[pI] || '',
                    email: row[eI] || '',
                    courses: courseInfo.code ? [courseInfo] : []
                });
            } else if (courseInfo.code) {
                teacherMap.get(key).courses.push(courseInfo);
            }
        }

        const teachers = Array.from(teacherMap.values());
        
        if (!teachers.length) {
            body.innerHTML = '<div class="info-placeholder"><p>No teacher data found.</p></div>';
            return;
        }

        let html = '<div class="info-card-grid">';
        teachers.forEach(t => {
            const coursesHtml = t.courses.map(c => 
                `<div style="font-size:0.72rem; background:rgba(124,58,237,0.1); border:1px solid rgba(124,58,237,0.2); padding:4px 8px; border-radius:6px; color:var(--text); margin-bottom:4px;">
                    <strong style="color:var(--accent-bright);">${escH(c.code)}:</strong> ${escH(c.title)}
                </div>`
            ).join('');

            let phoneHtml = '<span style="color:#64748b;font-size:0.82rem;">N/A</span>';
            if (t.phone && t.phone !== '-' && t.phone.toLowerCase() !== 'n/a') {
                let cleanPhone = t.phone.replace(/[^0-9+]/g, '');
                if(cleanPhone.startsWith('01')) cleanPhone = '88' + cleanPhone;
                cleanPhone = cleanPhone.replace('+', '');
                
                phoneHtml = `
                    <span style="font-size:0.85rem;font-weight:600;">${escH(t.phone)}</span>
                    <a href="https://wa.me/${cleanPhone}" target="_blank" style="margin-left:6px; color:#25D366; font-size:1rem;" title="WhatsApp">
                        <i class="fa-brands fa-whatsapp"></i>
                    </a>`;
            }

            html += `
                <div class="info-item-card" style="display:flex; flex-direction:column;">
                    <div style="margin-bottom:12px;">
                        <div style="font-size:1.05rem; font-weight:700; color:var(--text);">${escH(t.name)}</div>
                        <div style="font-size:0.78rem; color:var(--accent-bright); font-weight:600; margin-bottom:2px;">${escH(t.designation)}</div>
                        <div style="font-size:0.7rem; color:var(--text-secondary); opacity:0.8;">${escH(t.department)}</div>
                    </div>
                    
                    ${coursesHtml ? `
                    <div style="margin-bottom:12px;">
                        <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); margin-bottom:6px; font-weight:700;">Assigned Courses</div>
                        ${coursesHtml}
                    </div>` : ''}

                    <div style="margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.8rem; margin-bottom:5px;"><i class="fa-solid fa-phone" style="width:18px; opacity:0.5;"></i> ${phoneHtml}</div>
                        <div style="font-size:0.8rem; word-break:break-all;"><i class="fa-solid fa-envelope" style="width:18px; opacity:0.5;"></i> 
                            ${t.email && t.email !== '-' ? `<a href="mailto:${t.email}" style="color:var(--accent-bright); text-decoration:none;">${escH(t.email)}</a>` : '<span style="color:#64748b;">N/A</span>'}
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