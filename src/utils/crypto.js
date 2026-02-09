const crypto = require('crypto');
const fs = require('fs');

/**
 * Signs content binding it to a specific Device ID.
 */
function signContent(contentString, deviceId, privateKeyPath) {
  if (!deviceId || !privateKeyPath) return null;

  try {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const signer = crypto.createSign('SHA256');
    
    // The "Digital Chain of Custody"
    signer.update(contentString);
    signer.update(deviceId);
    signer.end();

    return signer.sign(privateKey, 'base64');
  } catch (err) {
    console.warn(`⚠️ Crypto Warning: ${err.message}`);
    return null;
  }
}

module.exports = { signContent };
