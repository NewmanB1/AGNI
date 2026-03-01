// src/runtime/export.js

/**
 * Generates a compressed Base64 string representing the learning proof.
 * Format: JSON -> String -> Btoa (MVP)
 * Future: JSON -> CBOR -> Gzip -> Base45
 */
export function generateProof(lessonId, score, userUuid) {
    const payload = {
        u: userUuid,
        l: lessonId,
        s: score,
        t: Math.floor(Date.now() / 1000)
    };
    return btoa(JSON.stringify(payload));
}

/**
 * Renders the QR Overlay
 * Requires a QR library (e.g., qrious or qrcode).
 * For MVP, we use an API fallback or simple text.
 */
export function showExportModal(proofString) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed; inset:0; background:#2D2D2D; z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#FFFFFF; text-align:center;";
    
    // Using a public API for MVP visualization (offline needs a local JS lib)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${proofString}`;
    
    var h2 = document.createElement('h2');
    h2.style.marginBottom = '20px';
    h2.textContent = 'Lesson Complete!';
    var qrWrap = document.createElement('div');
    qrWrap.style.cssText = 'background:white;padding:10px;border-radius:2px;';
    var qrImg = document.createElement('img');
    qrImg.src = qrUrl;
    qrImg.alt = 'Scan to save';
    qrWrap.appendChild(qrImg);
    var proofP = document.createElement('p');
    proofP.style.cssText = 'margin-top:20px;font-family:monospace;color:#e0e0e0;';
    proofP.textContent = proofString;
    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-top:20px;padding:18px 30px;font-size:18px;font-weight:bold;';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = function () { div.remove(); };
    div.appendChild(h2);
    div.appendChild(qrWrap);
    div.appendChild(proofP);
    div.appendChild(closeBtn);

    document.body.appendChild(div);
}
