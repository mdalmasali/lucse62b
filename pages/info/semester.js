/* ── Website/pages/info/semester.js ── */

async function loadSemester(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading Semester Info...</div>';

    try {
        const data = await fetchSheet('Semester');

        /* Prefer c.f (formatted display) over c.v to avoid GVIZ Date objects */
        const rows = (data.table?.rows || []).map(r =>
            (r.c || []).map(c => {
                if (!c) return '';
                if (c.f != null && c.f !== '') return String(c.f).trim();
                if (c.v == null) return '';
                const s = String(c.v).trim();
                /* Convert GVIZ date "Date(Y,M,D)" → "DD Mon YYYY" */
                const dm = s.match(/^Date\((\d+),(\d+),(\d+)\)/);
                if (dm) {
                    const d = new Date(parseInt(dm[1]), parseInt(dm[2]), parseInt(dm[3]));
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                }
                return s;
            })
        );

        if (!rows.length) {
            body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-graduation-cap"></i><p>No semester data found.</p></div>';
            return;
        }

        /* Skip header row if GVIZ did not consume it */
        const firstVal = rows[0] && rows[0][0] ? rows[0][0].toLowerCase().trim() : '';
        const startIdx = firstVal === 'semester' ? 1 : 0;

        /* Parse into { semesterName: [ {event, start, end} ] } */
        const semesters = {};
        const semOrder  = [];
        for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0] || !row[1]) continue;
            const sem   = row[0].trim();
            const event = row[1].trim();
            const start = row[2] ? row[2].trim() : '';
            const end   = row[3] ? row[3].trim() : '';
            if (!sem || !event) continue;
            if (!semesters[sem]) { semesters[sem] = []; semOrder.push(sem); }
            semesters[sem].push({ event, start, end });
        }

        if (!semOrder.length) {
            body.innerHTML = '<div class="info-placeholder"><i class="fa-solid fa-graduation-cap"></i><p>No semester events found.</p></div>';
            return;
        }

        /* ── Date helpers ── */
        function parseDate(str) {
            if (!str) return null;
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }

        function getStatus(startStr, endStr) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const s = parseDate(startStr), e = parseDate(endStr || startStr);
            if (!s) return 'upcoming';
            if (e) e.setHours(23, 59, 59, 999);
            if (today < s) return 'upcoming';
            if (e && today > e) return 'past';
            return 'active';
        }

        /* ── Event type → icon & color ── */
        function eventMeta(eventName) {
            const n = eventName.toLowerCase();
            if (n.includes('final') || n.includes('semester final')) return { icon: 'fa-solid fa-graduation-cap',       color: '#f87171' };
            if (n.includes('mid'))                                   return { icon: 'fa-solid fa-file-pen',             color: '#fb923c' };
            if (n.includes('exam'))                                  return { icon: 'fa-solid fa-file-pen',             color: '#fb923c' };
            if (n.includes('class'))                                 return { icon: 'fa-solid fa-chalkboard-user',      color: '#38bdf8' };
            if (n.includes('late') || n.includes('fine'))           return { icon: 'fa-solid fa-triangle-exclamation', color: '#fbbf24' };
            if (n.includes('registr') || n.includes('advising'))    return { icon: 'fa-solid fa-pen-to-square',        color: '#a78bfa' };
            if (n.includes('withdraw') || n.includes('refund'))     return { icon: 'fa-solid fa-rotate-left',          color: '#34d399' };
            if (n.includes('grade') || n.includes('submission'))    return { icon: 'fa-solid fa-circle-check',         color: '#4ade80' };
            return { icon: 'fa-solid fa-calendar-days', color: '#818cf8' };
        }

        /* ── Render ── */
        const sections = semOrder.map(semName => {
            const events  = semesters[semName];
            const total   = events.length;
            const pastCnt = events.filter(ev => getStatus(ev.start, ev.end) === 'past').length;
            const hasActive = events.some(ev => getStatus(ev.start, ev.end) === 'active');
            const progress  = Math.round((pastCnt / total) * 100);

            /* Status badge for semester */
            const semStatus = hasActive ? 'Ongoing'
                : pastCnt === total    ? 'Completed'
                : pastCnt === 0        ? 'Upcoming'
                :                        'In Progress';
            const semStatusColor = semStatus === 'Completed' ? '#34d399'
                : semStatus === 'Ongoing' || semStatus === 'In Progress' ? '#a78bfa'
                : '#fbbf24';

            /* Event rows */
            const eventRows = events.map((ev, idx) => {
                const status = getStatus(ev.start, ev.end);
                const meta   = eventMeta(ev.event);
                const isLast = idx === events.length - 1;

                const statusLabel = status === 'active'   ? 'Active Now'
                    : status === 'past'     ? 'Completed'
                    : 'Upcoming';
                const statusColor = status === 'active'   ? '#a78bfa'
                    : status === 'past'     ? '#34d399'
                    : 'var(--text-secondary)';
                const statusBg    = status === 'active'   ? 'rgba(167,139,250,0.12)'
                    : status === 'past'     ? 'rgba(52,211,153,0.1)'
                    : 'rgba(255,255,255,0.04)';

                const dateStr = ev.start === ev.end || !ev.end
                    ? ev.start
                    : `${ev.start} – ${ev.end}`;

                return `
                    <div style="display:flex;gap:0;position:relative;">
                        <!-- Timeline spine -->
                        <div style="display:flex;flex-direction:column;align-items:center;margin-right:16px;flex-shrink:0;">
                            <div style="width:34px;height:34px;border-radius:50%;
                                background:${status === 'past' ? meta.color + '25' : status === 'active' ? meta.color + '30' : 'rgba(255,255,255,0.04)'};
                                border:2px solid ${status === 'past' ? meta.color + '60' : status === 'active' ? meta.color : 'rgba(255,255,255,0.1)'};
                                display:flex;align-items:center;justify-content:center;
                                box-shadow:${status === 'active' ? `0 0 12px ${meta.color}40` : 'none'};
                                transition:all 0.2s;">
                                <i class="${meta.icon}" style="font-size:0.72rem;color:${status === 'past' ? meta.color + 'aa' : status === 'active' ? meta.color : 'var(--text-secondary)'};"></i>
                            </div>
                            ${!isLast ? `<div style="width:2px;flex:1;min-height:16px;background:${status === 'past' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'};margin:4px 0;"></div>` : ''}
                        </div>

                        <!-- Event card -->
                        <div style="flex:1;margin-bottom:${isLast ? '0' : '10px'};
                            background:${status === 'active' ? `rgba(${meta.color === '#a78bfa' ? '167,139,250' : '255,255,255'},0.04)` : 'rgba(255,255,255,0.02)'};
                            border:1px solid ${status === 'active' ? meta.color + '40' : 'rgba(255,255,255,0.06)'};
                            border-radius:12px;padding:12px 16px;
                            opacity:${status === 'past' ? '0.65' : '1'};
                            transition:all 0.2s;">
                            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                                <div style="flex:1;min-width:140px;">
                                    <div style="font-size:0.88rem;font-weight:700;color:${status === 'past' ? 'var(--text-secondary)' : 'var(--text)'};line-height:1.35;">
                                        ${escH(ev.event)}
                                    </div>
                                    <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:4px;display:flex;align-items:center;gap:5px;">
                                        <i class="fa-regular fa-calendar" style="opacity:0.6;"></i>
                                        ${escH(dateStr) || '—'}
                                    </div>
                                </div>
                                <span style="font-size:0.62rem;font-weight:700;padding:3px 10px;border-radius:20px;
                                    background:${statusBg};color:${statusColor};
                                    border:1px solid ${statusColor}30;white-space:nowrap;flex-shrink:0;
                                    ${status === 'active' ? `box-shadow:0 0 8px ${meta.color}30;` : ''}">
                                    ${status === 'active' ? '<span style="display:inline-block;width:5px;height:5px;background:currentColor;border-radius:50%;margin-right:4px;vertical-align:middle;animation:pulse 1.5s infinite;"></span>' : ''}
                                    ${statusLabel}
                                </span>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div style="margin-bottom:28px;">
                    <!-- Semester header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px;
                        background:linear-gradient(135deg,rgba(124,58,237,0.1),rgba(99,102,241,0.05));
                        border:1px solid rgba(124,58,237,0.2);border-radius:14px;padding:14px 18px;">
                        <div>
                            <div style="font-size:0.68rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Academic Calendar</div>
                            <div style="font-size:1.1rem;font-weight:800;color:var(--text);">${escH(semName)}</div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:0.7rem;font-weight:700;padding:4px 12px;border-radius:20px;
                                background:${semStatusColor}18;color:${semStatusColor};border:1px solid ${semStatusColor}35;">
                                ${semStatus}
                            </span>
                            <div style="margin-top:8px;width:120px;">
                                <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                                    <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#7c3aed,#4f46e5);border-radius:2px;transition:width 0.4s;"></div>
                                </div>
                                <div style="font-size:0.6rem;color:var(--text-secondary);margin-top:4px;text-align:right;">${pastCnt} / ${total} completed</div>
                            </div>
                        </div>
                    </div>

                    <!-- Timeline -->
                    <div>${eventRows}</div>
                </div>`;
        }).join('');

        body.innerHTML = `
            <style>
                @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
            </style>
            ${sections}
            <div style="font-size:0.67rem;color:var(--text-secondary);opacity:0.4;margin-top:4px;display:flex;align-items:center;gap:5px;">
                <i class="fa-solid fa-circle-info"></i>Dates are subject to change · Ref: Official LU Notice
            </div>`;

    } catch (err) {
        console.error('Semester Error:', err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching semester data.</p></div>';
    }
}
