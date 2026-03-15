/**
 * Sensor Toy Wizard — create a sensor "toy" using the Phyphox/DeviceMotion sensor set,
 * with optional threshold (for hardware_trigger) and optional link to a graphic.
 *
 * Returns: { name, sensorId, sensorLabel, threshold?, svgSpec? }
 * Use in lessons as hardware_trigger (threshold) and/or as an SVG step (svgSpec).
 */

import { openLinkToyToGraphicWizard } from './link-toy-to-graphic-wizard.js';

const SENSOR_LIST = [
  { id: 'accel.x', label: 'Accel X (linear)', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.y', label: 'Accel Y (linear)', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.z', label: 'Accel Z (linear)', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.magnitude', label: 'Accel magnitude', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.total.x', label: 'Accel+G X', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.total.y', label: 'Accel+G Y', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.total.z', label: 'Accel+G Z', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'accel.total', label: 'Accel+G total', unit: 'm/s²', group: 'Accelerometer' },
  { id: 'shake', label: 'Shake detected', unit: 'none', group: 'Accelerometer' },
  { id: 'gyro.x', label: 'Gyro X', unit: '°/s', group: 'Gyroscope' },
  { id: 'gyro.y', label: 'Gyro Y', unit: '°/s', group: 'Gyroscope' },
  { id: 'gyro.z', label: 'Gyro Z', unit: '°/s', group: 'Gyroscope' },
  { id: 'gyro.magnitude', label: 'Gyro magnitude', unit: '°/s', group: 'Gyroscope' },
  { id: 'rotation.alpha', label: 'Compass heading', unit: '°', group: 'Orientation' },
  { id: 'rotation.beta', label: 'Tilt front/back', unit: '°', group: 'Orientation' },
  { id: 'rotation.gamma', label: 'Tilt left/right', unit: '°', group: 'Orientation' },
  { id: 'orientation', label: 'Screen position', unit: 'none', group: 'Orientation' },
  { id: 'mag.x', label: 'Magnetometer X', unit: 'µT', group: 'Environment (Phyphox)' },
  { id: 'mag.y', label: 'Magnetometer Y', unit: 'µT', group: 'Environment (Phyphox)' },
  { id: 'mag.z', label: 'Magnetometer Z', unit: 'µT', group: 'Environment (Phyphox)' },
  { id: 'mag.magnitude', label: 'Magnetic field strength', unit: 'µT', group: 'Environment (Phyphox)' },
  { id: 'light', label: 'Light level', unit: 'lux', group: 'Environment (Phyphox)' },
  { id: 'pressure', label: 'Barometric pressure', unit: 'hPa', group: 'Environment (Phyphox)' },
  { id: 'temperature', label: 'Temperature', unit: '°C', group: 'Environment (Phyphox)' },
  { id: 'sound.level', label: 'Sound level', unit: 'dB', group: 'Environment (Phyphox)' }
];

const THRESHOLD_EXAMPLES = [
  { value: 'freefall > 0.3s', label: 'Freefall (e.g. drop phone) 0.3s' },
  { value: 'accel.total > 15', label: 'Strong shake (>15 m/s²)' },
  { value: 'accel.total > 2.5', label: 'Moderate shake (>2.5g)' },
  { value: 'shake', label: 'Any shake detected' },
  { value: 'rotation.beta > 45', label: 'Tilt forward >45°' },
  { value: 'light < 10', label: 'Dark (light < 10 lux)' },
  { value: 'sound.level > 70', label: 'Loud sound (>70 dB)' }
];

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/**
 * Opens the Sensor Toy Wizard. On finish, calls onDone({ name, sensorId, sensorLabel, threshold?, svgSpec? }).
 * @param {function(object): void} onDone
 */
export function openSensorToyWizard(onDone) {
  let step = 1;
  let toyName = '';
  let selectedSensor = null;
  let threshold = '';
  let linkedSvgSpec = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay wizard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'sensor-toy-wizard-title');

  function close() {
    overlay.remove();
  }

  function renderStep1Name() {
    return '<div class="wizard-step">' +
      '<h2 id="sensor-toy-wizard-title">Name your sensor toy</h2>' +
      '<p class="wizard-hint">Give this toy a short name (e.g. "Shake detector", "Tilt meter").</p>' +
      '<div class="wizard-field"><label for="toy-name">Name</label><input type="text" id="toy-name" class="input" placeholder="e.g. Shake detector" value="' + escapeHtml(toyName) + '" /></div>' +
      '<div class="wizard-actions"><button type="button" class="btn" data-action="cancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" data-action="next">Next →</button></div></div>';
  }

  function renderStep2Sensor() {
    const byGroup = {};
    SENSOR_LIST.forEach(function (s) {
      const g = s.group || 'Other';
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(s);
    });
    let html = '';
    ['Accelerometer', 'Gyroscope', 'Orientation', 'Environment (Phyphox)'].forEach(function (g) {
      if (!byGroup[g]) return;
      html += '<div class="wizard-category"><h4 class="wizard-cat-title">' + escapeHtml(g) + '</h4><div class="wizard-factory-grid">';
      byGroup[g].forEach(function (s) {
        const sel = selectedSensor && selectedSensor.id === s.id ? ' selected' : '';
        html += '<button type="button" class="wizard-factory-card lesson-wizard-card' + sel + '" data-id="' + escapeHtml(s.id) + '" data-label="' + escapeHtml(s.label) + '">';
        html += '<span class="wizard-factory-label">' + escapeHtml(s.label) + '</span>';
        html += '<span class="wizard-factory-desc">' + escapeHtml(s.unit) + '</span></button>';
      });
      html += '</div></div>';
    });
    return '<div class="wizard-step">' +
      '<h2>Choose sensor</h2>' +
      '<p class="wizard-hint">DeviceMotion (accelerometer, gyro, orientation) and Phyphox (magnetometer, light, pressure, sound) are available.</p>' +
      '<div class="wizard-scroll">' + html + '</div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="back">← Back</button>' +
      '<button type="button" class="btn btn-primary" data-action="next">Next →</button>' +
      '</div></div>';
  }

  function renderStep3Threshold() {
    const examplesHtml = THRESHOLD_EXAMPLES.map(function (ex) {
      return '<button type="button" class="btn btn-sm toy-threshold-example" style="margin:0.25rem;" data-value="' + escapeHtml(ex.value) + '">' + escapeHtml(ex.label) + '</button>';
    }).join('');
    return '<div class="wizard-step">' +
      '<h2>Trigger threshold (optional)</h2>' +
      '<p class="wizard-hint">Use this if the toy should unlock a step when the sensor meets a condition (e.g. hardware_trigger step).</p>' +
      '<div class="wizard-field"><label for="toy-threshold">Threshold expression</label>' +
      '<input type="text" id="toy-threshold" class="input" placeholder="e.g. accel.total > 2.5 or freefall > 0.3s" value="' + escapeHtml(threshold) + '" />' +
      '<p class="hint">Examples:</p><div style="margin-top:0.5rem;">' + examplesHtml + '</div></div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="back">← Back</button>' +
      '<button type="button" class="btn btn-primary" data-action="next">Next →</button>' +
      '</div></div>';
  }

  function renderStep4LinkGraphic() {
    const linkedSummary = linkedSvgSpec
      ? linkedSvgSpec.factory + (linkedSvgSpec.opts && (linkedSvgSpec.opts.w || linkedSvgSpec.opts.h) ? ' ' + (linkedSvgSpec.opts.w || 420) + '×' + (linkedSvgSpec.opts.h || 280) : '')
      : 'None';
    return '<div class="wizard-step">' +
      '<h2>Link to graphic (optional)</h2>' +
      '<p class="wizard-hint">Drive a visual (time graph, gauge, number line, etc.) with this sensor so learners see the data.</p>' +
      '<p><strong>Sensor:</strong> ' + escapeHtml(selectedSensor ? selectedSensor.label : '') + '</p>' +
      '<p><strong>Current graphic:</strong> <span id="toy-linked-summary">' + escapeHtml(linkedSummary) + '</span></p>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="link">' + (linkedSvgSpec ? 'Change graphic' : 'Link to graphic') + '</button>' +
      '<button type="button" class="btn" data-action="back">← Back</button>' +
      '<button type="button" class="btn btn-primary" data-action="done">Done</button>' +
      '</div></div>';
  }

  function render() {
    const content = document.getElementById('sensor-toy-wizard-content');
    if (!content) return;

    if (step === 1) {
      content.innerHTML = renderStep1Name();
      content.querySelector('[data-action="next"]').addEventListener('click', function () {
        toyName = (document.getElementById('toy-name') && document.getElementById('toy-name').value.trim()) || 'Sensor toy';
        step = 2;
        render();
      });
    } else if (step === 2) {
      content.innerHTML = renderStep2Sensor();
      content.querySelectorAll('.lesson-wizard-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectedSensor = { id: btn.getAttribute('data-id'), label: btn.getAttribute('data-label') };
          content.querySelectorAll('.lesson-wizard-card').forEach(function (c) { c.classList.remove('selected'); });
          btn.classList.add('selected');
        });
      });
      content.querySelector('[data-action="back"]').addEventListener('click', function () { step = 1; render(); });
      content.querySelector('[data-action="next"]').addEventListener('click', function () {
        if (!selectedSensor) return;
        step = 3;
        render();
      });
    } else if (step === 3) {
      content.innerHTML = renderStep3Threshold();
      content.querySelectorAll('.toy-threshold-example').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const el = document.getElementById('toy-threshold');
          if (el) el.value = btn.getAttribute('data-value');
        });
      });
      content.querySelector('[data-action="back"]').addEventListener('click', function () { step = 2; render(); });
      content.querySelector('[data-action="next"]').addEventListener('click', function () {
        threshold = (document.getElementById('toy-threshold') && document.getElementById('toy-threshold').value.trim()) || '';
        step = 4;
        render();
      });
    } else {
      content.innerHTML = renderStep4LinkGraphic();
      content.querySelector('[data-action="back"]').addEventListener('click', function () { step = 3; render(); });
      content.querySelector('[data-action="link"]').addEventListener('click', function () {
        openLinkToyToGraphicWizard(
          { preselectedSensor: selectedSensor },
          function (svgSpec) {
            linkedSvgSpec = svgSpec;
            const sumEl = document.getElementById('toy-linked-summary');
            if (sumEl) sumEl.textContent = svgSpec.factory + (svgSpec.opts && (svgSpec.opts.w || svgSpec.opts.h) ? ' ' + (svgSpec.opts.w || 420) + '×' + (svgSpec.opts.h || 280) : '');
          }
        );
      });
      content.querySelector('[data-action="done"]').addEventListener('click', function () {
        onDone({
          name: toyName || 'Sensor toy',
          sensorId: selectedSensor ? selectedSensor.id : '',
          sensorLabel: selectedSensor ? selectedSensor.label : '',
          threshold: threshold || undefined,
          svgSpec: linkedSvgSpec || undefined
        });
        close();
      });
    }
    content.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  }

  overlay.innerHTML = '<div class="modal-content wizard-modal" id="sensor-toy-wizard-modal">' +
    '<div id="sensor-toy-wizard-content"></div></div>';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  render();
}
