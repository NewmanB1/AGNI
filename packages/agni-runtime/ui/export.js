// packages/agni-runtime/ui/export.js
// ES5 compatible — targets Android 7.0+ (Chrome 51 WebView).

/**
 * Generates a compressed Base64 string representing the learning proof.
 * Format: JSON -> String -> Btoa (MVP)
 * Future: JSON -> CBOR -> Gzip -> Base45
 */
function generateProof(lessonId, score, userUuid) {
    var payload = {
        l: lessonId,
        s: score,
        t: Math.floor(Date.now() / 1000)
    };
    return btoa(JSON.stringify(payload));
}

/**
 * Renders the QR Overlay using a local QR library.
 * Does NOT send proof data to external services.
 */
function showExportModal(proofString) {
    var div = document.createElement('div');
    div.style.cssText = "position:fixed; inset:0; background:#2D2D2D; z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#FFFFFF; text-align:center;";

    var h2 = document.createElement('h2');
    h2.style.marginBottom = '20px';
    h2.textContent = 'Lesson Complete!';

    var qrWrap = document.createElement('div');
    qrWrap.style.cssText = 'background:white;padding:10px;border-radius:2px;min-height:250px;min-width:250px;display:flex;align-items:center;justify-content:center;';
    if (typeof QRious !== 'undefined') {
        var canvas = document.createElement('canvas');
        new QRious({ element: canvas, value: proofString, size: 250 });
        qrWrap.appendChild(canvas);
    } else {
        var fallback = document.createElement('p');
        fallback.style.cssText = 'color:#333;font-family:monospace;word-break:break-all;max-width:230px;font-size:10px;';
        fallback.textContent = proofString;
        qrWrap.appendChild(fallback);
    }

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-top:20px;padding:18px 30px;font-size:18px;font-weight:bold;';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = function () { div.remove(); };

    div.appendChild(h2);
    div.appendChild(qrWrap);
    div.appendChild(closeBtn);

    document.body.appendChild(div);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateProof: generateProof, showExportModal: showExportModal };
}
