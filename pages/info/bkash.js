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

        // Header detection matching your sheet headers
        if (!headers.some(h => h.includes('fees') || h.includes('writing') || h.includes('method'))) {
            headers = rows[0].map(h => (h || '').toLowerCase().trim());
            startIndex = 1;
        }

        // Mapping indices based on your specific headers
        const hfI = headers.findIndex(h => h.includes('head of fees')) > -1 ? headers.findIndex(h => h.includes('head of fees')) : 0;
        const fcI = headers.findIndex(h => h.includes('fees code')) > -1 ? headers.findIndex(h => h.includes('fees code')) : 1;
        const wtI = headers.findIndex(h => h.includes('writing') || h.includes('method')) > -1 ? headers.findIndex(h => h.includes('writing') || h.includes('method')) : 2;

        let tableRows = '';
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[hfI]) continue;
            
            tableRows += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem; color: var(--text);">${escH(row[hfI])}</td>
                    <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem; font-weight: 700; color: #e879f9; text-align: center;">${escH(row[fcI])}</td>
                    <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-secondary); text-align: left;">${escH(row[wtI])}</td>
                </tr>`;
        }

        const qrData = encodeURIComponent('https://qr.bka.sh/28101405Xfi8xA00');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px;">
                
                <div class="info-item-card" style="border-top: 4px solid #e879f9; text-align: center; padding: 25px;">
                    <div style="font-size: 0.75rem; font-weight: 800; color: #e879f9; text-transform: uppercase; margin-bottom: 15px;">bKash Official Account</div>
                    
                    <div style="background: #fff; padding: 12px; border-radius: 15px; display: inline-block; margin-bottom: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                        <img src="${qrUrl}" alt="bKash QR" style="width: 160px; height: 160px; display: block; border-radius: 8px;">
                    </div>

                    <div style="font-size: 1.25rem; font-weight: 800; color: var(--text); letter-spacing: 1px;">01751-998866</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: var(--accent-bright); margin-top: 5px;">Leading University</div>
                    
                    <div style="margin-top: 20px; text-align: left; background: rgba(232,121,249,0.05); padding: 18px; border-radius: 12px; border: 1px solid rgba(232,121,249,0.1);">
                        <div style="font-size: 0.8rem; font-weight: 700; color: #e879f9; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-circle-info"></i> Instructions:
                        </div>
                        <ul style="font-size: 0.78rem; color: var(--text-secondary); padding-left: 18px; line-height: 1.7; list-style-type: decimal;">
                            <li>Scan the QR code from the bKash App.</li>
                            <li>Or select <b>Make Payment</b> option.</li>
                            <li>Number: <b>01751998866</b></li>
                            <li>Enter your <b>Student ID</b> and <b>Fees Code</b> as reference.</li>
                            <li>Enter PIN to confirm.</li>
                        </ul>
                    </div>
                </div>

                <div class="info-item-card" style="padding: 0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02);">
                        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text);">Fee Structure</div>
                        <div style="font-size: 0.72rem; color: var(--text-secondary);">Leading University fee list & payment methods</div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.03);">
                                    <th style="padding: 12px; text-align: left; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase;">Head of Fees</th>
                                    <th style="padding: 12px; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; text-align: center;">Fees Code</th>
                                    <th style="padding: 12px; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; text-align: left;">Writing/Typing Method</th>
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