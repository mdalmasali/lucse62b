/* ── Website/pages/info/course-offer.js ── */

async function loadCourseOffer(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Course Offer...</div>';
    try {
        const [data, sem] = await Promise.all([fetchSheet('CPG_Courses'), getSemesterLabel()]);
        const rows = sheetRows(data);

        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No course offer data found.</p></div>';
            return;
        }

        // CPG_Courses fixed structure: A=Title, B=Code, C=Credit, D=Prerequisite
        const ti = 0, ci = 1, cri = 2, pi = 3;

        const cards = [];
        let totalCredits = 0;
        let courseCount  = 0;
        let courseSeen   = false;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            const code      = (row[ci]  || '').toString().trim();
            const title     = (row[ti]  || '').toString().trim();
            const creditRaw = (row[cri] || '').toString().trim(); // empty = no credit set
            const credit    = parseFloat(creditRaw) || 0;

            // Skip header and non-course rows (valid codes: CSE-3201, GED-1101, etc.)
            if (!code || !/^[A-Z]{2,}-\d/i.test(code)) continue;

            // Once courses started, stop at first course with no credit (future semester)
            if (courseSeen && !creditRaw) break;

            courseSeen = true;

            const prereq = (row[pi] || '').toString().trim();
            const color  = courseColor(code);
            const creditStr = credit % 1 === 0 ? String(Math.round(credit)) : String(credit);

            totalCredits += credit;
            courseCount++;

            const prereqHtml = (prereq && prereq !== '-')
                ? `<div class="co-prereq">
                     <i class="fa-solid fa-arrow-right-to-bracket"></i>
                     Prereq: <strong style="color:var(--text);">${escH(prereq)}</strong>
                   </div>`
                : `<div class="co-prereq" style="color:#34d399;">
                     <i class="fa-solid fa-check"></i> No prerequisite
                   </div>`;

            cards.push(`
                <div class="co-card" style="border-top:3px solid ${color};">
                    <div class="co-card-head">
                        <span class="co-code-pill" style="color:${color};background:${color}1a;">${escH(code)}</span>
                        <span class="co-credit-badge" style="color:${color};border-color:${color}35;background:${color}10;">
                            ${creditStr}&thinsp;cr
                        </span>
                    </div>
                    <div class="co-card-title">${escH(title)}</div>
                    ${prereqHtml}
                </div>
            `);
        }

        if (!cards.length) {
            body.innerHTML = '<div class="info-placeholder"><p>No courses found.</p></div>';
            return;
        }

        const totalCreditStr = totalCredits % 1 === 0 ? String(Math.round(totalCredits)) : String(totalCredits);

        body.innerHTML = `
            <div class="co-summary-bar">
                <div class="rt-sync" style="margin-bottom:0;">
                    <div class="rt-sync-dot"></div>
                    <span>${escH(sem)} &nbsp;·&nbsp; Batch 62, Section B</span>
                </div>
                <div class="co-stats">
                    <div class="co-stat">
                        <span class="co-stat-num">${courseCount}</span>
                        <span class="co-stat-label">Courses</span>
                    </div>
                    <div class="co-stat-divider"></div>
                    <div class="co-stat">
                        <span class="co-stat-num" style="color:#c4b5fd;">${totalCreditStr}</span>
                        <span class="co-stat-label">Credits</span>
                    </div>
                </div>
            </div>
            <div class="info-card-grid co-card-grid">${cards.join('')}</div>`;

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching course offer data.</p></div>';
    }
}
