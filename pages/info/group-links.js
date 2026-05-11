/* ── Website/pages/info/group-links.js ── */

async function loadGroupLinks(body) {

    body.innerHTML = `
        <div class="info-loading-spin">
            <div class="spin-sm"></div>
            Loading Links & Codes...
        </div>
    `;

    try {

        const data = await fetchSheet('CPG_Courses');
        const rows = sheetRows(data);

        console.log("Rows:", rows);

        if (!rows || rows.length === 0) {

            body.innerHTML = `
                <div class="info-placeholder">
                    <p>No data found.</p>
                </div>
            `;

            return;
        }

        let html = `<div class="info-card-grid">`;

        let foundAny = false;

        // Row 0 = Header
        for (let i = 1; i < rows.length; i++) {

            const row = rows[i];

            if (!row || row.length === 0) continue;

            /* ---------------- FIXED COLUMN INDEX ---------------- */

            const title = row[0] || '';
            const courseCode = row[1] || '';
            const teacher = row[4] || 'TBA';

            const waLink = row[9] || '';
            const gcLink = row[10] || '';
            const gcCode = row[11] || '';

            // Empty হলে skip
            if (!waLink && !gcLink && !gcCode) {
                continue;
            }

            foundAny = true;

            const color =
                typeof courseColor === 'function'
                    ? courseColor(courseCode)
                    : '#1a73e8';

            html += `
                <div 
                    class="info-item-card"
                    style="
                        border-top: 4px solid ${color};
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        padding: 15px;
                        background: var(--bg-card, #111827);
                        border-radius: 12px;
                        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                    "
                >

                    <!-- Top Info -->
                    <div>

                        <div
                            style="
                                font-size: 0.72rem;
                                font-weight: 800;
                                color: ${color};
                                text-transform: uppercase;
                                letter-spacing: 0.05em;
                            "
                        >
                            ${escH(courseCode)}
                        </div>

                        <div
                            style="
                                font-size: 1rem;
                                font-weight: 700;
                                color: var(--text);
                                margin: 4px 0;
                            "
                        >
                            ${escH(title)}
                        </div>

                        <div
                            style="
                                font-size: 0.82rem;
                                color: var(--text-secondary);
                                opacity: 0.85;
                            "
                        >
                            <i class="fa-solid fa-chalkboard-user"></i>
                            ${escH(teacher)}
                        </div>

                    </div>

                    <!-- Classroom Code -->
                    ${
                        gcCode &&
                        gcCode !== '-'
                            ? `
                        <div
                            style="
                                background: rgba(255,255,255,0.03);
                                border: 1px dashed rgba(255,255,255,0.08);
                                padding: 10px;
                                border-radius: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 10px;
                            "
                        >

                            <span
                                style="
                                    font-size: 0.75rem;
                                    color: var(--text-secondary);
                                "
                            >
                                Classroom Code:
                            </span>

                            <code
                                style="
                                    font-family: monospace;
                                    font-size: 0.9rem;
                                    font-weight: 700;
                                    color: #b388ff;
                                    letter-spacing: 1px;
                                "
                            >
                                ${escH(gcCode)}
                            </code>

                        </div>
                    `
                            : ''
                    }

                    <!-- Buttons -->
                    <div
                        style="
                            margin-top: auto;
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                        "
                    >

                        ${
                            waLink &&
                            waLink !== '-'
                                ? `
                            <a
                                href="${waLink}"
                                target="_blank"
                                rel="noopener noreferrer"
                                style="
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                    background: #25D366;
                                    color: #fff;
                                    padding: 10px;
                                    border-radius: 8px;
                                    text-decoration: none;
                                    font-weight: 700;
                                    font-size: 0.82rem;
                                    transition: 0.2s;
                                "
                            >
                                <i class="fa-brands fa-whatsapp"></i>
                                WhatsApp Group
                            </a>
                        `
                                : ''
                        }

                        ${
                            gcLink &&
                            gcLink !== '-'
                                ? `
                            <a
                                href="${gcLink}"
                                target="_blank"
                                rel="noopener noreferrer"
                                style="
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                    background: #1a73e8;
                                    color: #fff;
                                    padding: 10px;
                                    border-radius: 8px;
                                    text-decoration: none;
                                    font-weight: 700;
                                    font-size: 0.82rem;
                                    transition: 0.2s;
                                "
                            >
                                <i class="fa-solid fa-graduation-cap"></i>
                                Google Classroom
                            </a>
                        `
                                : ''
                        }

                    </div>

                </div>
            `;
        }

        html += `</div>`;

        if (!foundAny) {

            body.innerHTML = `
                <div class="info-placeholder">
                    <p>No links or codes available yet.</p>
                </div>
            `;

            return;
        }

        body.innerHTML = html;

    } catch (err) {

        console.error("Group Link Error:", err);

        body.innerHTML = `
            <div class="info-placeholder">
                <p>Error fetching links and codes.</p>
            </div>
        `;
    }
}