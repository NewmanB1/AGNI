const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkHtml = require('remark-html');

async function markdownToHtml(md) {
  if (!md) return '';
  const file = await unified()
    .use(remarkParse)
    .use(remarkHtml)
    .process(md);
  return String(file);
}

// Simple CLI argument parser
function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile = null;
  let format = 'html';
  let output = null;
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.endsWith('.yaml') || arg.endsWith('.yml')) {
      inputFile = arg;
    } else if (arg.startsWith('--format=')) {
      format = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      output = arg.split('=')[1];
    } else if (arg.startsWith('--output-dir=')) {
      outputDir = arg.split('=')[1];
    }
  }

  if (!inputFile) {
    console.error('Usage: node compiler.js <lesson.yaml> [--format=html|native] [--output=file.html] [--output-dir=dir]');
    process.exit(1);
  }

  if (format === 'native' && !outputDir) {
    console.error('--output-dir is required when --format=native');
    process.exit(1);
  }

  return { inputFile, format, output, outputDir };
}

// Runtime HTML template (same as yours, slightly cleaned up)
function generateHtmlRuntime(lesson) {
  return `
<!DOCTYPE html>
<html lang="${lesson.meta.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${lesson.meta.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; background: #f4f4f4; margin: 0; }
    .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); max-width: 640px; margin: 0 auto; }
    button { background: #0066cc; color: white; border: none; padding: 16px 32px; font-size: 18px; border-radius: 8px; width: 100%; margin: 12px 0; cursor: pointer; }
    button:disabled { background: #aaa; cursor: not-allowed; }
    .step-content { line-height: 1.6; font-size: 18px; }
    .sensor-status { margin: 20px 0; padding: 12px; background: #e6f0ff; border-radius: 6px; font-weight: bold; text-align: center; }
    h1 { color: #222; margin-top: 0; }
  </style>
</head>
<body>
  <div id="app" class="card"><h1>Loading lesson...</h1></div>

  <script>
    const lesson = ${JSON.stringify(lesson)};
    let currentStep = 0;
    let sensorListenerActive = false;

    function vibrate(pattern = 'success') {
      if (navigator.vibrate) {
        const patterns = { heavy_thud: [60, 40, 180], success: [120, 60, 120] };
        navigator.vibrate(patterns[pattern] || 200);
      }
    }

    function parseThreshold(str) {
      const m = str.match(/^([a-z\\.]+)\\s*([><]=?|==)\\s*(-?[\\d.]+)([a-z\\/2]*)?$/i);
      if (!m) return null;
      return { subject: m[1], op: m[2], value: parseFloat(m[3]), unit: m[4] || '' };
    }

    function evaluateThreshold(reading, threshold) {
      if (!threshold) return false;
      const { subject, op, value } = threshold;
      if (subject === 'freefall') return reading < 0.25; // simple g-force threshold
      // Extend with more cases later (accel, gyro, etc.)
      return false;
    }

    function render() {
      const step = lesson.steps[currentStep];
      const app = document.getElementById('app');
      let html = '<h1>' + lesson.meta.title + '</h1>';
      html += '<div class="step-content">' + (step.htmlContent || step.content || '') + '</div>';

      if (step.type === 'instruction') {
        html += '<button onclick="next()">Continue</button>';
      } else if (step.type === 'hardware_trigger') {
        html += '<div id="sensor-status" class="sensor-status">Waiting for trigger...</div>';
      } else if (step.type === 'quiz') {
        step.answer_options.forEach((opt, i) => {
          html += '<button onclick="answer(' + i + ')">' + opt + '</button>';
        });
      }

      app.innerHTML = html;

      if (step.type === 'hardware_trigger') {
        startSensor(step);
      }
    }

    function next() {
      if (currentStep < lesson.steps.length - 1) {
        currentStep++;
        render();
      } else {
        document.getElementById('app').innerHTML = '<h1>Lesson Complete!</h1><p>You have finished this lesson.</p>';
        vibrate('success');
      }
    }

    function answer(idx) {
      const step = lesson.steps[currentStep];
      if (idx === step.correct_index) {
        vibrate('success');
        alert('Correct!');
        next();
      } else {
        navigator.vibrate?.(400);
        alert('Incorrect — try again');
      }
    }

    function startSensor(step) {
      if (sensorListenerActive) return;
      sensorListenerActive = true;

      if (!window.DeviceMotionEvent) {
        alert('Device motion not supported — skipping sensor step');
        next();
        return;
      }

      const handler = (e) => {
        if (currentStep !== lesson.steps.indexOf(step)) {
          window.removeEventListener('devicemotion', handler);
          return;
        }
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const g = Math.hypot(acc.x, acc.y, acc.z) / 9.81;
        const status = document.getElementById('sensor-status');
        if (status) status.textContent = 'Current: ' + g.toFixed(2) + ' g';

        const threshold = parseThreshold(step.threshold);
        if (evaluateThreshold(g, threshold)) {
          vibrate(step.feedback || 'heavy_thud');
          sensorListenerActive = false;
          window.removeEventListener('devicemotion', handler);
          next();
        }
      };

      window.addEventListener('devicemotion', handler);
    }

    render();
  </script>
</body>
</html>`;
}

async function buildHtml(lesson, outputPath) {
  // Process markdown in steps
  for (const step of lesson.steps) {
    if (step.content) {
      step.htmlContent = await markdownToHtml(step.content);
    }
  }

  const html = generateHtmlRuntime(lesson);
  fs.writeFileSync(outputPath, html);
  console.log(`HTML bundle written to: ${outputPath}`);
}

function buildNative(lesson, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Build clean Markdown content
  let md = `# ${lesson.meta.title}\n\n`;
  md += `${lesson.meta.description || ''}\n\n`;

  lesson.steps.forEach((step, i) => {
    md += `## Step ${i + 1}: ${step.type}\n\n`;
    if (step.content) md += `${step.content}\n\n`;
    if (step.type === 'quiz') {
      md += '**Options:**\n';
      step.answer_options.forEach((opt, idx) => {
        md += `- ${opt}${idx === step.correct_index ? ' (correct)' : ''}\n`;
      });
      md += '\n';
    }
    if (step.type === 'hardware_trigger') {
      md += `**Trigger:** ${step.sensor} ${step.threshold} → ${step.feedback}\n\n`;
    }
  });

  fs.writeFileSync(path.join(outputDir, 'lesson.md'), md);

  // Sensors config for native app
  const sensors = lesson.steps
    .filter(s => s.type === 'hardware_trigger')
    .map(s => ({
      sensor: s.sensor,
      threshold: s.threshold,
      feedback: s.feedback,
      content: s.content || ''
    }));

  fs.writeFileSync(path.join(outputDir, 'sensors.json'), JSON.stringify(sensors, null, 2));

  // Metadata + ontology + gate
  const metadata = {
    meta: lesson.meta,
    ontology: lesson.ontology || {},
    gate: lesson.gate || null,
    signatures: lesson.signatures || []
  };
  fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`Native files written to: ${outputDir}`);
}

async function main() {
  const { inputFile, format, output, outputDir } = parseArgs();

  console.log(`Loading lesson: ${inputFile}`);
  const fileContent = fs.readFileSync(inputFile, 'utf8');
  const lesson = yaml.load(fileContent);

  console.log(`Title: ${lesson.meta?.title || 'Untitled'}`);

  const baseName = path.basename(inputFile, path.extname(inputFile));

  if (format === 'html') {
    const outPath = output || `${baseName}.html`;
    await buildHtml(lesson, outPath);
  } else if (format === 'native') {
    const dir = outputDir || `dist/${baseName}-native`;
    buildNative(lesson, dir);
  } else {
    console.error(`Unknown format: ${format}`);
    process.exit(1);
  }

  console.log('Build finished.');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
