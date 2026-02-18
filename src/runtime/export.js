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
    div.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; text-align:center;";
    
    // Using a public API for MVP visualization (offline needs a local JS lib)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${proofString}`;
    
    div.innerHTML = `
        <h2 style="margin-bottom:20px;">Lesson Complete!</h2>
        <div style="background:white; padding:10px; border-radius:8px;">
            <img src="${qrUrl}" alt="Scan to save" />
        </div>
        <p style="margin-top:20px; font-family:monospace; color:#aaa;">${proofString}</p>
        <button id="close-export" style="margin-top:20px; padding:10px 30px; font-size:18px;">Close</button>
    `;
    
    document.body.appendChild(div);
    document.getElementById('close-export').onclick = () => div.remove();
}
