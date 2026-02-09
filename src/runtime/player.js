// This file is injected into the HTML bundle.
// Variables like LESSON_DATA and SIGNATURE are prepended by the compiler.

function verifyIntegrity() {
  const localId = localStorage.getItem('ols_device_id');
  
  // 1. Check if device exists
  if (!localId) {
    document.body.innerHTML = '<h1>Error: Device ID missing.</h1>';
    return false;
  }

  // 2. Check Lease Binding
  // INTENDED_OWNER is injected by the compiler
  if (localId !== INTENDED_OWNER) {
    document.body.innerHTML = `
      <div class="error-screen">
        <h1>🔒 Security Alert</h1>
        <p>This lesson is authorized for device: <code>${INTENDED_OWNER}</code></p>
        <p>Your device: <code>${localId}</code></p>
        <p>Please visit the Village Hub to authorize this device.</p>
      </div>
    `;
    return false;
  }

  return true;
}

function renderStep() {
  // ... (The rendering logic we wrote previously) ...
  console.log("Rendering step:", currentStep);
}

window.addEventListener('load', () => {
  if (verifyIntegrity()) {
    renderStep();
  }
});
