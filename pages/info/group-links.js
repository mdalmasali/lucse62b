/* ── Website/pages/info/group-links.js ── */

async function loadGroupLinks(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Links & Codes...</div>';
    try {
        const data = await fetchSheet('CPG_Courses');
        const rows = sheetRows(data);
        
        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No data found.</p></div>';
            return;
        }

        // Row checking logic fix: Check cols for header first, then fallback to row[0]
        let headers = (data.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (!headers.some(h => h.includes('title') || h.includes('code') || h.includes('name'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1; // Header is in rows[0], so data starts at index 1
        }

        const tI = headers.findIndex(h => h.includes('title')) > -1 ? headers.findIndex(h => h.includes('title')) : 0;
        const cI = headers.findIndex(h => h.includes('code')) > -1 ? headers.findIndex(h => h.includes('code')) : 1;
        const nI = headers.findIndex(h => h.includes('teacher name') || h === 'name') > -1 ? headers.findIndex(h => h.includes('teacher name') || h === 'name') : 2;
        const waI = headers.findIndex(h => h.includes('whatsapp') || h.includes('group link') || h === 'link') > -1 ? headers.findIndex(h => h.includes('whatsapp') || h.includes('group link') || h === 'link') : 7;
        const gclI = headers.findIndex(h => h.includes('classroom link') || h.includes('gcr link')) > -1 ? headers.findIndex(h => h.includes('classroom link') || h.includes('gcr link')) : 8;
        const gccI = headers.findIndex(h => h.includes('classroom code') || h.includes('gcr code') || h.includes('class code')) > -1 ? headers.findIndex(h => h.includes('classroom code') || h.includes('gcr code') || h.includes('class code')) : 9;

        let html = '<div class="info-card-grid">';
        let foundAny = false;

        // Loop shuru hobe correct startIndex theke
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const title = row[tI] || '';
            const courseCode = row[cI] || '';
            const teacher = row[nI] || 'TBA';
            const waLink = row[waI] || '';
            const gcLink = row[gclI] || '';
            const gcCode = row[gccI] || '';

            if (!waLink && !gcLink && !gcCode) continue;
            foundAny = true;

            const color = courseColor(courseCode);

            html += `
                <div class="info-item-card" style="border-top: 4px solid ${color}; display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <div style="font-size: 0.7rem; font-weight: 800; color: ${color}; text-transform: uppercase; letter-spacing: 0.05em;">${escH(courseCode)}</div>
                        <div style="font-size: 1rem; font-weight: 700; color: var(--text); margin: 4px 0;">${escH(title)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); opacity: 0.8;"><i class="fa-solid fa-chalkboard-user"></i> ${escH(teacher)}</div>
                    </div>

                    ${gcCode && gcCode !== '-' ? `
                    <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1); padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">Classroom Code:</span>
                        <code style="font-family: monospace; font-size: 0.9rem; font-weight: 700; color: var(--accent-bright); letter-spacing: 1px;">${escH(gcCode)}</code>
                    </div>
                    ` : ''}

                    <div style="margin-top: auto; display: flex; flex-direction: column; gap: 8px;">
                        ${waLink && waLink !== '-' ? `
                        <a href="${waLink}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: #25D366; color: #fff; padding: 10px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.8rem; transition: opacity 0.2s;">
                            <i class="fa-brands fa-whatsapp"></i> WhatsApp Group
                        </a>
                        ` : ''}
                        
                        ${gcLink && gcLink !== '-' ? `
                        <a href="${gcLink}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: #1a73e8; color: #fff; padding: 10px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.8rem; transition: opacity 0.2s;">
                            <i class="fa-solid fa-graduation-cap"></i> Google Classroom
                        </a>
                        ` : ''}
                    </div>
                </div>`;
        }

        if (!foundAny) {
            body.innerHTML = '<div class="info-placeholder"><p>No links or codes available yet.</p></div>';
            return;
        }

        body.innerHTML = html + '</div>';
    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching links and codes.</p></div>';
    }
}