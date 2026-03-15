/**
 * Link Toy to Graphic Wizard — links a sensor (toy) to an SVG visual.
 * Use from Sensor Toy Wizard (sensor preselected) or SVG Factory Wizard (svg preselected).
 * Returns updated svg_spec with sensor/sensorMin/sensorMax or streams filled in.
 *
 * openLinkToyToGraphicWizard({ preselectedSensor?, preselectedSvgSpec? }, onDone(svgSpec))
 */

// Sensors: mirror of @agni/plugins builtins/sensors.js (DeviceMotion + Phyphox)
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

// SVG factories that can be driven by a sensor (have sensor/sensorMin/sensorMax or streams)
const SENSOR_CAPABLE_FACTORIES = [
  { id: 'timeGraph', label: 'Time Graph', icon: '📉', desc: 'Scrolling graph of sensor over time (like Phyphox)' },
  { id: 'gauge', label: 'Gauge / Meter', icon: '🎛️', desc: 'Dial with needle' },
  { id: 'numberLineDynamic', label: 'Number Line (dynamic)', icon: '↔️✨', desc: 'Ball moves with sensor value' },
  { id: 'clockFaceDynamic', label: 'Clock Face (dynamic)', icon: '🕐✨', desc: 'Clock driven by sensor or time' },
  { id: 'unitCircle', label: 'Unit Circle', icon: '🔵📐', desc: 'Trig circle driven by angle sensor' },
  { id: 'polygonDynamic', label: 'Polygon (dynamic)', icon: '⬡✨', desc: 'Rotation/scale driven by sensor' }
];

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/**
 * @param {{ preselectedSensor?: { id: string, label: string }, preselectedSvgSpec?: { factory: string, opts: object } }} options
 * @param {function(object): void} onDone - callback with svg_spec { factory, opts } (with sensor binding)
 */
export function openLinkToyToGraphicWizard(options, onDone) {
  options = options || {};
  const preselectedSensor = options.preselectedSensor || null;
  const preselectedSvgSpec = options.preselectedSvgSpec || null;

  let step = preselectedSensor && preselectedSvgSpec ? 3 : preselectedSensor ? 2 : 1;
  let selectedSensor = preselectedSensor ? { id: preselectedSensor.id, label: preselectedSensor.label || preselectedSensor.id } : null;
  let selectedFactoryId = preselectedSvgSpec ? preselectedSvgSpec.factory : null;
  let baseOpts = preselectedSvgSpec && preselectedSvgSpec.opts ? Object.assign({}, preselectedSvgSpec.opts) : { w: 420, h: 280, title: '' };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay wizard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'link-wizard-title');

  function close() {
    overlay.remove();
  }

  function applyBindingAndDone() {
    const sensorId = selectedSensor ? selectedSensor.id : (document.getElementById('link-sensor-id') && document.getElementById('link-sensor-id').value);
    const sensorMin = parseFloat((document.getElementById('link-sensor-min') && document.getElementById('link-sensor-min').value)) || 0;
    const sensorMax = parseFloat((document.getElementById('link-sensor-max') && document.getElementById('link-sensor-max').value)) || 10;
    if (!sensorId) {
      onDone({ factory: selectedFactoryId, opts: baseOpts });
      close();
      return;
    }
    const opts = Object.assign({}, baseOpts);
    if (selectedFactoryId === 'timeGraph') {
      opts.streams = opts.streams || [{ sensor: null, label: 'Stream 1', color: '#ff6b35', yMin: 0, yMax: 10 }];
      opts.streams[0] = Object.assign({}, opts.streams[0], { sensor: sensorId, yMin: sensorMin, yMax: sensorMax });
    } else {
      opts.sensor = sensorId;
      opts.sensorMin = sensorMin;
      opts.sensorMax = sensorMax;
    }
    onDone({ factory: selectedFactoryId, opts: opts });
    close();
  }

  function renderStep1PickSensor() {
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
        html += '<button type="button" class="wizard-factory-card link-sensor-card" data-id="' + escapeHtml(s.id) + '" data-label="' + escapeHtml(s.label) + '">';
        html += '<span class="wizard-factory-label">' + escapeHtml(s.label) + '</span>';
        html += '<span class="wizard-factory-desc">' + escapeHtml(s.unit) + '</span></button>';
      });
      html += '</div></div>';
    });
    return '<div class="wizard-step">' +
      '<h2 id="link-wizard-title">Choose sensor (toy)</h2>' +
      '<p class="wizard-hint">Select the sensor that will drive the graphic. DeviceMotion and Phyphox sensors are available.</p>' +
      '<div class="wizard-scroll">' + html + '</div>' +
      '<div class="wizard-actions"><button type="button" class="btn" data-action="cancel">Cancel</button></div></div>';
  }

  function renderStep2PickGraphic() {
    let html = SENSOR_CAPABLE_FACTORIES.map(function (f) {
      return '<button type="button" class="wizard-factory-card" data-id="' + escapeHtml(f.id) + '">' +
        '<span class="wizard-factory-icon">' + escapeHtml(f.icon) + '</span>' +
        '<span class="wizard-factory-label">' + escapeHtml(f.label) + '</span>' +
        '<span class="wizard-factory-desc">' + escapeHtml(f.desc) + '</span></button>';
    }).join('');
    return '<div class="wizard-step">' +
      '<h2>Choose graphic</h2>' +
      '<p class="wizard-hint">Select a visual that can be driven by the sensor. Sensor: <strong>' + escapeHtml(selectedSensor && selectedSensor.label) + '</strong></p>' +
      '<div class="wizard-factory-grid">' + html + '</div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="back">← Back</button>' +
      '</div></div>';
  }

  function renderStep3Bind() {
    const factory = SENSOR_CAPABLE_FACTORIES.find(function (f) { return f.id === selectedFactoryId; });
    const isTimeGraph = selectedFactoryId === 'timeGraph';
    const sensorLabel = selectedSensor ? selectedSensor.label : '';
    return '<div class="wizard-step">' +
      '<h2>Link sensor to graphic</h2>' +
      '<p class="wizard-hint">' + escapeHtml(factory ? factory.label : selectedFactoryId) + ' will display <strong>' + escapeHtml(sensorLabel) + '</strong>.</p>' +
      (preselectedSensor ? '' : '<div class="wizard-field"><label for="link-sensor-id">Sensor</label><select id="link-sensor-id" class="input">' +
        SENSOR_LIST.map(function (s) {
          return '<option value="' + escapeHtml(s.id) + '"' + (selectedSensor && selectedSensor.id === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
        }).join('') + '</select></div>') +
      '<div class="wizard-field"><label for="link-sensor-min">Value range min</label><input type="number" id="link-sensor-min" class="input" value="' + (baseOpts.sensorMin != null ? baseOpts.sensorMin : 0) + '" step="any" /></div>' +
      '<div class="wizard-field"><label for="link-sensor-max">Value range max</label><input type="number" id="link-sensor-max" class="input" value="' + (baseOpts.sensorMax != null ? baseOpts.sensorMax : 10) + '" step="any" /></div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="back">← Back</button> ' +
      '<button type="button" class="btn btn-primary" data-action="apply">Apply & use graphic</button>' +
      '</div></div>';
  }

  function render() {
    const content = document.getElementById('link-wizard-content');
    if (!content) return;

    if (step === 1) {
      content.innerHTML = renderStep1PickSensor();
      content.querySelectorAll('.link-sensor-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectedSensor = { id: btn.getAttribute('data-id'), label: btn.getAttribute('data-label') };
          step = preselectedSvgSpec ? 3 : 2;
          if (preselectedSvgSpec) {
            selectedFactoryId = preselectedSvgSpec.factory;
            baseOpts = preselectedSvgSpec.opts ? Object.assign({}, preselectedSvgSpec.opts) : baseOpts;
          }
          render();
        });
      });
    } else if (step === 2) {
      content.innerHTML = renderStep2PickGraphic();
      content.querySelectorAll('.wizard-factory-card[data-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectedFactoryId = btn.getAttribute('data-id');
          step = 3;
          render();
        });
      });
      content.querySelector('[data-action="back"]').addEventListener('click', function () {
        step = 1;
        selectedSensor = null;
        render();
      });
    } else {
      content.innerHTML = renderStep3Bind();
      content.querySelector('[data-action="back"]').addEventListener('click', function () {
        if (preselectedSvgSpec) {
          step = 1;
          selectedSensor = null;
        } else if (preselectedSensor) {
          step = 2;
          selectedFactoryId = null;
        } else {
          step = 2;
          selectedFactoryId = null;
        }
        render();
      });
      content.querySelector('[data-action="apply"]').addEventListener('click', applyBindingAndDone);
    }
    content.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  }

  overlay.innerHTML = '<div class="modal-content wizard-modal" id="link-wizard-modal">' +
    '<div id="link-wizard-content"></div></div>';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  render();
}

export { SENSOR_LIST };
