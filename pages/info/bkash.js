/* ── Website/pages/info/bkash.js ── */

async function loadBkash(body) {
    body.innerHTML = '<div class="info-loading-spin"><div class="spin-sm"></div> Loading bKash Details...</div>';
    try {
        const data = await fetchSheet('bKash');
        const rows = sheetRows(data);

        if (rows.length === 0) {
            body.innerHTML = '<div class="info-placeholder"><p>No bKash data found.</p></div>';
            return;
        }

        let headers = (data.table?.cols || []).map(c => (c.label || '').toLowerCase().trim());
        let startIndex = 0;

        if (!headers.some(h => h.includes('fees') || h.includes('writing') || h.includes('method'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1;
        }

        const hfI = headers.findIndex(h => h.includes('head of fees'));
        const fcI = headers.findIndex(h => h.includes('fees code'));
        const wtI = headers.findIndex(h => h.includes('writing') || h.includes('method'));

        const hf = hfI > -1 ? hfI : 0;
        const fc = fcI > -1 ? fcI : 1;
        const wt = wtI > -1 ? wtI : 2;

        let tableRows = '';
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[hf]) continue;
            tableRows += `
                <tr>
                    <td style="padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.84rem; color: var(--text);">${escH(row[hf])}</td>
                    <td style="padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.84rem; font-weight: 700; color: #e879f9; text-align: center;">${escH(row[fc])}</td>
                    <td style="padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-secondary);">${escH(row[wt])}</td>
                </tr>`;
        }

        const qrData = encodeURIComponent('https://qr.bka.sh/28101405Xfi8xA00');
        const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start;">

                <div class="info-item-card" style="border-top: 3px solid #e879f9; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 22px;">
                    <div style="font-size: 0.68rem; font-weight: 800; color: #e879f9; text-transform: uppercase; letter-spacing: 0.08em;">bKash Official Account</div>

                    <div style="background: #fff; padding: 10px; border-radius: 14px; display: inline-block; box-shadow: 0 8px 20px rgba(0,0,0,0.3);">
                        <img src="${qrUrl}" alt="bKash QR" style="width: 150px; height: 150px; display: block; border-radius: 6px;">
                    </div>

                    <div>
                        <div style="font-size: 1.2rem; font-weight: 800; color: var(--text); letter-spacing: 1px;">01751-998866</div>
                        <div style="font-size: 0.85rem; font-weight: 600; color: var(--accent-bright); margin-top: 4px;">Leading University</div>
                    </div>

                    <div style="width: 100%; text-align: left; background: rgba(232,121,249,0.06); padding: 14px; border-radius: 12px; border: 1px solid rgba(232,121,249,0.12);">
                        <div style="font-size: 0.75rem; font-weight: 700; color: #e879f9; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-circle-info"></i> Instructions
                        </div>
                        <ol style="font-size: 0.76rem; color: var(--text-secondary); padding-left: 16px; line-height: 1.8; margin: 0;">
                            <li>Scan the QR code from the bKash App.</li>
                            <li>Or select <b style="color: var(--text);">Make Payment</b>.</li>
                            <li>Number: <b style="color: var(--text);">01751998866</b></li>
                            <li>Enter your <b style="color: var(--text);">Student ID</b> &amp; <b style="color: var(--text);">Fees Code</b>.</li>
                            <li>Enter PIN to confirm.</li>
                        </ol>
                    </div>
                </div>

                <div class="info-item-card" style="padding: 0; overflow: hidden;">
                    <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.02);">
                        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text); margin-bottom: 2px;">Fee Structure</div>
                        <div style="font-size: 0.72rem; color: var(--text-secondary);">Leading University fee codes &amp; payment methods</div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.03);">
                                    <th style="padding: 10px 14px; text-align: left; font-size: 0.62rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; white-space: nowrap;">Head of Fees</th>
                                    <th style="padding: 10px 14px; font-size: 0.62rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; text-align: center; white-space: nowrap;">Fees Code</th>
                                    <th style="padding: 10px 14px; font-size: 0.62rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; text-align: left; white-space: nowrap;">Writing Method</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="info-placeholder"><p>Error fetching bKash data.</p></div>';
    }
}
