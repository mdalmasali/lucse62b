/* ── Website/pages/info/course-offer.js ── */

async function loadCourseOffer(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Course Offers...</div>';
    try {
        const data = await fetchSheet('Course_Offer'); 
        const rows = sheetRows(data);
        
        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No course offer data found.</p></div>';
            return;
        }

        let headers = (data.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (!headers.some(h => h.includes('code') || h.includes('title') || h.includes('credit'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1;
        }

        // Strict header finding jate onno column-er sathe mix na hoy
        const cI = headers.findIndex(h => h === 'code' || h === 'course code' || h === 'course_code') > -1 ? headers.findIndex(h => h === 'code' || h === 'course code' || h === 'course_code') : 1;
        const tI = headers.findIndex(h => h.includes('title')) > -1 ? headers.findIndex(h => h.includes('title')) : 0;
        const crI = headers.findIndex(h => h.includes('credit')) > -1 ? headers.findIndex(h => h.includes('credit')) : 2;
        const pI = headers.findIndex(h => h.includes('prerequisite') || h.includes('pre-req')) > -1 ? headers.findIndex(h => h.includes('prerequisite') || h.includes('pre-req')) : 3;

        let html = '<div class="info-card-grid">';
        let totalCredits = 0;
        let courseCount = 0;

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            const code = (row[cI] || '').toString().trim();
            const title = (row[tI] || '').toString().trim();
            const creditRaw = row[crI] ? row[crI].toString().trim() : '0';
            const credit = parseFloat(creditRaw) || 0;
            
            // ==========================================
            // 🔥 DEEP CHECK FIX (BULLETPROOF STOPPING) 🔥
            // ==========================================
            
            // 1. Jodi code ar title duitoi missing thake (Faka row)
            if (code === '' && title === '') {
                break; 
            }

            // 2. Course code generally choto hoy. Jodi etar length 20 er beshi hoy,
            // er mane eta kono nam ba paragraph ("Class representative details" type).
            if (code.length > 20 && code.toLowerCase() !== 'tba') {
                break; 
            }

            // 3. Kono single course-er credit 10 er beshi hoy na. 
            // Jodi beshi hoy (jemon phone number), sathe sathe stop!
            if (credit > 10) {
                break; 
            }
            // ==========================================

            const prereq = row[pI] || '-';

            if (code && code.toLowerCase() !== 'tba') {
                totalCredits += credit;
                courseCount++;
            }

            const color = courseColor(code);

            html += `
                <div class="info-item-card" style="border-top: 4px solid ${color}; display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: ${color}; text-transform: uppercase; letter-spacing: 0.05em;">${escH(code)}</div>
                        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text); margin: 4px 0; line-height: 1.4;">${escH(title)}</div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: auto; padding-top: 5px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; font-size: 0.75rem; color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.05);">
                            <div style="font-size: 0.65rem; text-transform: uppercase; margin-bottom: 2px;">Credit</div>
                            <strong style="color: var(--text); font-size: 0.9rem;">${credit.toFixed(2)}</strong>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; font-size: 0.75rem; color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.05); flex: 1;">
                            <div style="font-size: 0.65rem; text-transform: uppercase; margin-bottom: 2px;">Prerequisite</div>
                            <strong style="color: var(--text); font-size: 0.85rem;">${escH(prereq)}</strong>
                        </div>
                    </div>
                </div>`;
        }

        const summaryHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, rgba(124,58,237,0.1), rgba(99,102,241,0.05)); border: 1px solid rgba(124,58,237,0.2); padding: 15px 25px; border-radius: 14px; margin-bottom: 20px;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Total Courses</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--text);">${courseCount}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Total Credits</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: #c4b5fd;">${totalCredits.toFixed(2)}</div>
                </div>
            </div>
        `;

        body.innerHTML = summaryHtml + html + '</div>';

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching course offer data.</p></div>';
    }
}