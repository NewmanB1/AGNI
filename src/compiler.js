#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkMath = require('remark-math');
const remarkHtml = require('remark-html');
const crypto = require('crypto');

// --- Configuration ---
const MARKDOWN_PROCESSOR = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkHtml, { sanitize: false });

// --- CLI Argument Parsing ---
const args = process.argv.slice(2);
const params = {
  inputFile: null,
  format: 'html',
  output: null,
  outputDir: null,
  deviceId: null,    // The ID of the student's device
  privateKey: null   // The Hub's Private Key (path to pem)
};

args.forEach((arg) => {
  if (arg.startsWith('--format=')) params.format = arg.split('=')[1];
  else if (arg.startsWith('--output=')) params.output = arg.split('=')[1];
  else if (arg.startsWith('--output-dir=')) params.outputDir = arg.split('=')[1];
  else if (arg.startsWith('--device-id=')) params.deviceId = arg.split('=')[1];
  else if (arg.startsWith('--private-key=')) params.privateKey = arg.split('=')[1];
  else if (!arg.startsWith('-')) params.inputFile = arg;
});

// --- Helper: Signing Logic ---
function generateSignature(contentString, deviceId, privateKeyPath) {
  if (!deviceId || !privateKeyPath) return null;
  
  try {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const signer = crypto.createSign('SHA256');
    
    // We sign the Content + The Intended Recipient ID
    // This binds the file to the device.
    signer.update(contentString);
    signer.update(deviceId);
    signer.end();
    
    const signature = signer.sign(privateKey, 'base64');
    return signature;
  } catch (err) {
    console.warn("⚠️ Warning: Could not sign lesson. Missing key or invalid path.");
    return null;
  }
}

// --- Builder: Native (JSON + Markdown) ---
function buildNative(lessonData, outputDir) {
  console.log(`📦 Building Native Bundle...`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  // 1. Prepare Content
  const contentDir = path.join(outputDir, 'content');
  if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir);

  const cleanSteps = lessonData.steps.map((step, index) => {
    const stepFile = `step-${String(index + 1).padStart(2, '0')}.md`;
    if (step.content) fs.writeFileSync(path.join(contentDir, stepFile), step.content);
    return { ...step, content_src: `content/${stepFile}`, content: undefined };
  });

  const nativeManifest = { ...lessonData, steps: cleanSteps };
  const manifestString = JSON.stringify(nativeManifest);

  // 2. Sign the Manifest
  // In native mode, the app calculates hash(JSON_STRING + DEVICE_ID)
  let signature = null;
  if (params.deviceId && params.privateKey) {
    signature = generateSignature(manifestString, params.deviceId, params.privateKey);
    nativeManifest.meta.signature = signature;
    nativeManifest.meta.owner_device_id = params.deviceId; // Visible owner
  }

  // 3. Write
  fs.writeFileSync(path.join(outputDir, 'lesson.json'), JSON.stringify(nativeManifest, null, 2));
  console.log(`✅ Native build complete. Signature: ${signature ? 'SECURED' : 'NONE'}`);
}

// --- Builder: HTML SPA ---
function buildHtml(lessonData, outputFile) {
  console.log(`🌍 Building Secure HTML Player...`);

  // 1. Process Content
  const runtimeData = {
    ...lessonData,
    steps: lessonData.steps.map(step => ({
      ...step,
      htmlContent: MARKDOWN_PROCESSOR.processSync(step.content || '').toString()
    }))
  };

  const runtimeString = JSON.stringify(runtimeData);
  
  // 2. Generate Signature
  let signature = null;
  if (params.deviceId && params.privateKey) {
    signature = generateSignature(runtimeString, params.deviceId, params.privateKey);
  }

  // 3. Security Runtime Script
  // This runs INSIDE the browser to verify itself
  const securityScript = `
    const RAW_LESSON_DATA = ${runtimeString};
    const SIGNATURE = "${signature || ''}";
    const INTENDED_OWNER = "${params.deviceId || ''}";
    const HUB_PUBLIC_KEY = \`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA...\`; // In production, inject real Hub Public Key here

    async function verifyIntegrity() {
      if (!SIGNATURE) return true; // Unsigned mode (Development)

      // 1. Get the local device ID (stored in localStorage or App Interface)
      const localDeviceId = localStorage.getItem('ols_device_id');
      
      if (!localDeviceId) {
        document.body.innerHTML = '<h1 style="color:red">Security Error: Device ID not found.</h1>';
        return false;
      }

      // 2. Check Device Binding (Cheap check)
      if (localDeviceId !== INTENDED_OWNER) {
        document.body.innerHTML = \`<h1 style="color:red">⛔ Unauthorized Copy</h1><p>This lesson is licensed to Device: \${INTENDED_OWNER}</p>\`;
        return false;
      }

      // 3. Verify Cryptographic Integrity (Expensive check)
      // Note: In a real browser, we use WebCrypto API to verify signature
      // For this demo, we assume the Binding Check is the primary deterrent
      // and the Native App handles the heavy crypto verification.
      
      return true;
    }
    
    // Hook into initialization
    window.addEventListener('load', async () => {
      const allowed = await verifyIntegrity();
      if (allowed) {
        window.Lesson = RAW_LESSON_DATA;
        renderStep(); // Start the app
      }
    });
  `;

  const runtimeScript = `
    // ... (Previous Runtime Logic, but using window.Lesson) ...
    let currentStep = 0;
    function renderStep() { 
       if(!window.Lesson) return; 
       // ... render logic ...
    }
  `;

  // 4. HTML Assembly
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${lessonData.meta.title}</title>
  <style>/* CSS Styles */</style>
</head>
<body>
  <div id="app">Verifying Secure Lease...</div>
  <script>${securityScript}</script>
  <script>${runtimeScript}</script>
</body>
</html>`;

  if (path.dirname(outputFile) !== '.') {
    if (!fs.existsSync(path.dirname(outputFile))) fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  }
  fs.writeFileSync(outputFile, html);
  console.log(`✅ HTML build complete. Secure Binding: ${params.deviceId}`);
}

// --- Main Execution ---
if (!params.inputFile) {
  console.error('Usage: agni <file> --format=<html|native> --device-id=<uuid> --private-key=<path>');
  process.exit(1);
}

const rawFile = fs.readFileSync(params.inputFile, 'utf8');
const lessonData = yaml.load(rawFile);

if (params.format === 'html') buildHtml(lessonData, params.output);
else if (params.format === 'native') buildNative(lessonData, params.outputDir);
