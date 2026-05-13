/* ── Website/pages/info/bus.js ── */

async function loadBus(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Bus Schedule...</div>';

    try {
        const data = await fetchSheet('Bus');

        /* ── Custom row parser: prefer c.f (formatted) over c.v (raw).
           GVIZ converts time cells to "Date(1899,11,30,H,M,0)" — c.f has "8:00 AM". ── */
        const rows = (data.table?.rows || []).map(r =>
            (r.c || []).map(c => {
                if (!c) return '';
                if (c.f != null && c.f !== '') return String(c.f).trim();
                if (c.v == null) return '';
                const s = String(c.v).trim();
                const dm = s.match(/^Date\((\d+),(\d+),(\d+),(\d+),(\d+)/);
                if (dm) {
                    let h = parseInt(dm[4]), m = parseInt(dm[5]);
                    const ap = h >= 12 ? 'PM' : 'AM';
                    h = h % 12 || 12;
                    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
                }
                return s;
            })
        );

        if (!rows.length) {
            body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-bus"></i><p>No bus schedule data found.</p></div>';
            return;
        }

        const firstVal = rows[0] && rows[0][0] ? rows[0][0].toLowerCase().trim() : '';
        const startIdx = firstVal === 'schedule' ? 1 : 0;

        const schedules = {};
        for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0] || !row[3]) continue;
            const sched = row[0].trim(), dayGrp = row[1].trim(), dir = row[2].trim();
            const time  = row[3].trim();
            const note  = row[4] ? row[4].trim() : '';
            if (!sched || !time) continue;
            if (!schedules[sched])              schedules[sched]              = {};
            if (!schedules[sched][dayGrp])      schedules[sched][dayGrp]      = { 'To LU': [], 'From LU': [] };
            if (!schedules[sched][dayGrp][dir]) schedules[sched][dayGrp][dir] = [];
            schedules[sched][dayGrp][dir].push({ time, note });
        }

        const keys     = Object.keys(schedules);
        const examKeys = keys.filter(k => k.startsWith('Exam:')).sort();
        const hasReg   = keys.includes('Regular');
        const hasExam  = examKeys.length > 0;

        if (!hasReg && !hasExam) {
            body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-bus"></i><p>No schedule data available.</p></div>';
            return;
        }

        const tabs = [];
        if (hasReg)  tabs.push({ id: 'regular', label: 'Regular',   icon: 'fa-solid fa-bus',      color: '#34d399' });
        if (hasExam) tabs.push({ id: 'exam',    label: 'Exam Days', icon: 'fa-solid fa-file-pen', color: '#f87171' });

        let activeTab = tabs[0].id;

        /* ─────────────────────────────────────
           Schedule Table  (Arrival / Departure)
           ───────────────────────────────────── */
        function scheduleTable(title, icon, accentColor, direction, dayData) {
            const DAY_ORDER  = ['Sun–Thu', 'Saturday', 'Friday'];
            const dayGroups  = DAY_ORDER.filter(d => dayData[d] && (dayData[d][direction] || []).length);
            Object.keys(dayData).forEach(d => { if (!dayGroups.includes(d) && (dayData[d][direction] || []).length) dayGroups.push(d); });
            if (!dayGroups.length) return '';

            // Build grid: each day group is a column
            const colMinW = Math.floor(100 / dayGroups.length);

            const headers = dayGroups.map(dg => `
                <th style="padding:10px 14px;text-align:center;font-size:0.68rem;font-weight:800;
                    color:${accentColor};text-transform:uppercase;letter-spacing:0.09em;
                    background:${accentColor}12;border-right:1px solid rgba(255,255,255,0.05);
                    white-space:nowrap;">
                    ${escH(dg)}
                </th>`).join('');

            // Find max rows
            const maxLen = Math.max(...dayGroups.map(dg => (dayData[dg][direction] || []).length));
            let bodyRows = '';
            for (let r = 0; r < maxLen; r++) {
                const cells = dayGroups.map(dg => {
                    const entry = (dayData[dg][direction] || [])[r];
                    if (!entry) return `<td style="padding:8px 14px;border-right:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;color:var(--text-secondary);font-size:0.72rem;opacity:0.25;">—</td>`;
                    return `
                        <td style="padding:8px 14px;border-right:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;">
                            <span style="font-size:0.88rem;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;">${escH(entry.time)}</span>
                            ${entry.note ? `<br><span style="font-size:0.6rem;background:rgba(251,191,36,0.12);color:#fbbf24;padding:1px 6px;border-radius:4px;font-weight:700;">${escH(entry.note)}</span>` : ''}
                        </td>`;
                }).join('');
                bodyRows += `<tr style="background:${r % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'};">${cells}</tr>`;
            }

            return `
                <div style="margin-bottom:22px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <div style="width:3px;height:18px;background:${accentColor};border-radius:2px;flex-shrink:0;"></div>
                        <i class="${icon}" style="color:${accentColor};font-size:0.78rem;"></i>
                        <span style="font-size:0.78rem;font-weight:800;color:${accentColor};text-transform:uppercase;letter-spacing:0.08em;">${title}</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:14px;overflow:hidden;">
                        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                            <table style="width:100%;border-collapse:collapse;min-width:300px;">
                                <thead>
                                    <tr>
                                        ${headers}
                                    </tr>
                                </thead>
                                <tbody>${bodyRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        }

        /* ─────────────────────────────────────
           Render: Regular
           ───────────────────────────────────── */
        function renderRegular() {
            const regData = schedules['Regular'] || {};
            return (
                scheduleTable('Arrival Schedule — To Leading University',   'fa-solid fa-arrow-right-to-bracket', '#34d399', 'To LU',   regData) +
                scheduleTable('Departure Schedule — From Leading University', 'fa-solid fa-arrow-right-from-bracket', '#38bdf8', 'From LU', regData)
            );
        }

        /* ─────────────────────────────────────
           Render: Exam Days
           ───────────────────────────────────── */
        function renderExam() {
            return examKeys.map(key => {
                const slotData  = schedules[key] || {};
                const examLabel = key.replace('Exam: ', '');
                return `
                    <div style="background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.22);border-radius:14px;overflow:hidden;margin-bottom:18px;">
                        <div style="padding:12px 18px;border-bottom:1px solid rgba(248,113,113,0.15);background:rgba(248,113,113,0.08);display:flex;align-items:center;gap:8px;">
                            <i class="fa-solid fa-clock" style="color:#f87171;font-size:0.8rem;"></i>
                            <span style="font-size:0.88rem;font-weight:800;color:#f87171;">${escH(examLabel)} Exam</span>
                        </div>
                        <div style="padding:18px;">
                            ${scheduleTable('Arrival — To Leading University',    'fa-solid fa-arrow-right-to-bracket',   '#34d399', 'To LU',   slotData)}
                            ${scheduleTable('Departure — From Leading University', 'fa-solid fa-arrow-right-from-bracket', '#38bdf8', 'From LU', slotData)}
                        </div>
                    </div>`;
            }).join('');
        }

        function renderTab(id) {
            if (id === 'regular') return renderRegular();
            if (id === 'exam')    return renderExam();
            return '';
        }

        /* ─────────────────────────────────────
           Tab switcher
           ───────────────────────────────────── */
        function tabStyle(tab, isActive) {
            return `padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-size:0.82rem;font-weight:700;
                font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:7px;transition:all 0.18s;
                background:${isActive ? `linear-gradient(135deg,${tab.color}cc,${tab.color}77)` : 'transparent'};
                color:${isActive ? '#fff' : 'var(--text-secondary)'};`;
        }

        const tabBtns = tabs.map(t => `
            <button class="bus-tab-btn" data-tabid="${t.id}" style="${tabStyle(t, t.id === activeTab)}">
                <i class="${t.icon}" style="font-size:0.75rem;"></i> ${t.label}
            </button>`).join('');

        body.innerHTML = `
            <div style="display:flex;gap:6px;margin-bottom:22px;background:rgba(255,255,255,0.03);padding:4px;border-radius:12px;border:1px solid var(--border);width:fit-content;">
                ${tabBtns}
            </div>
            <div id="busTabContent">${renderTab(activeTab)}</div>
            <div style="font-size:0.67rem;color:var(--text-secondary);opacity:0.4;margin-top:6px;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-circle-info"></i>Schedule may change · Always check notice board for updates
            </div>`;

        body.addEventListener('click', e => {
            const btn = e.target.closest('.bus-tab-btn');
            if (btn) {
                activeTab = btn.dataset.tabid;
                body.querySelectorAll('.bus-tab-btn').forEach(b => {
                    const t = tabs.find(x => x.id === b.dataset.tabid);
                    b.style.cssText = tabStyle(t, b.dataset.tabid === activeTab);
                });
                document.getElementById('busTabContent').innerHTML = renderTab(activeTab);
            }
        });

    } catch (err) {
        console.error('Bus Schedule Error:', err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching bus schedule.</p></div>';
    }
}
