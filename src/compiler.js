const fs = require('fs');
const yaml = require('js-yaml');
const unified = require('unified');
const markdown = require('remark-parse');
const html = require('remark-html');
const path = require('path');

// 1. Read the Lesson
const lessonPath = process.argv[2] || 'lessons/gravity.yaml';
const lesson = yaml.load(fs.readFileSync(lessonPath, 'utf8'));

// ── Output handling ──
// Default output path
let outputPath = 'dist/gravity.html';

// Parse --output flag if provided
const args = process.argv;
const outputIndex = args.indexOf('--output');
if (outputIndex !== -1 && args[outputIndex + 1]) {
  outputPath = args[outputIndex + 1];
}

// Create the output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Created output directory: ${outputDir}`);
}

// 2. The Runtime Template (The "Player" Engine)
const template = (json) => `
<!DOCTYPE html>
<html lang="${json.meta?.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${json.meta?.title || 'OLS Lesson'}</title>
  <style>
    body { 
      font-family: system-ui, sans-serif; 
      padding: 20px; 
      max-width: 700px; 
      margin: 0 auto; 
      line-height: 1.6; 
      background: #f9f9f9; 
    }
    h1, h2, h3 { color: #1a3c5e; }
    button { 
      padding: 14px 28px; 
      font-size: 1.1em; 
      background: #0066cc; 
      color: white; 
      border: none; 
      border-radius: 8px; 
      cursor: pointer; 
      margin: 16px 8px 8px 0; 
    }
    button:hover { background: #0052a3; }
    .progress { 
      font-size: 0.95em; 
      color: #555; 
      margin: 12px 0; 
    }
    .quiz-options label { 
      display: block; 
      margin: 12px 0; 
      padding: 10px; 
      background: #fff; 
      border: 1px solid #ddd; 
      border-radius: 6px; 
      cursor: pointer; 
    }
    .quiz-options input:checked + span { font-weight: bold; color: #0066cc; }
    #debug { 
      font-size: 0.85em; 
      color: #777; 
      margin-top: 20px; 
      font-family: monospace; 
    }
    .flash { 
      animation: flash 0.6s; 
    }
    @keyframes flash { 
      0% { background: #ffff99; } 
      100% { background: transparent; } 
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="debug">Waiting for sensor permissions...</div>

  <script>
    const lesson = ${JSON.stringify(json, null, 2)};
    let stepIndex = 0;
    let freefallStart = null;

    // Vibration patterns
    const vibrationPatterns = {
      short: 200,
      success: [100, 50, 100, 50, 200],
      success_pattern: [80, 40, 80, 40, 300],
      long: 800
    };

    // Screen flash fallback
    function flashScreen() {
      document.body.classList.add('flash');
      setTimeout(() => document.body.classList.remove('flash'), 600);
    }

    // Trigger feedback
    function triggerFeedback(feedback = '') {
      const pattern = vibrationPatterns[feedback.replace('vibration:', '')] || 300;
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      } else {
        flashScreen();
      }
    }

    // Improved sensor logic
    function startSensor(threshold, onTrigger) {
      const debugEl = document.getElementById('debug');

      function listen(event) {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        const total = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
        let triggered = false;

        // Parse threshold string
        if (threshold.includes('accel.z >')) {
          const val = parseFloat(threshold.split('>')[1].trim());
          if (Math.abs(acc.z) > val) triggered = true;
        }
        else if (threshold.includes('accel.total <')) {
          const val = parseFloat(threshold.split('<')[1].trim());
          if (total < val) triggered = true;
        }
        else if (threshold.includes('freefall')) {
          const match = threshold.match(/freefall\\s*>\\s*([\\d.]+)s?/);
          const durationMs = match ? parseFloat(match[1]) * 1000 : 300;

          if (total < 1.5) {  // near freefall
            if (!freefallStart) freefallStart = Date.now();
            if (Date.now() - freefallStart >= durationMs) {
              triggered = true;
              freefallStart = null;
            }
          } else {
            freefallStart = null;
          }
        }

        debugEl.innerText = \`Accel: total=\${total.toFixed(2)} m/s² | z=\${(acc.z || 0).toFixed(2)} | triggered=\${triggered}\`;

        if (triggered) {
          onTrigger();
          window.removeEventListener('devicemotion', listen);
        }
      }

      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(perm => {
            if (perm === 'granted') {
              window.addEventListener('devicemotion', listen);
            } else {
              debugEl.innerText = 'Motion permission denied';
            }
          })
          .catch(err => {
            debugEl.innerText = 'Permission error: ' + err.message;
          });
      } else {
        window.addEventListener('devicemotion', listen);
      }
    }

    // Render current step
    async function render() {
      const app = document.getElementById('app');
      const step = lesson.steps[stepIndex];
      if (!step) {
        app.innerHTML = '<h1>Lesson Complete!</h1><p>Congratulations!</p>';
        return;
      }

      // Convert markdown to HTML
      let contentHtml = '';
      if (step.content) {
        const { value } = await unified()
          .use(markdown)
          .use(html, { sanitize: true })
          .process(step.content);
        contentHtml = value;
      }

      let html = \`
        <h1>\${lesson.meta?.title || 'Lesson'}</h1>
        <div class="progress">Step \${stepIndex + 1} of \${lesson.steps.length}</div>
        \${contentHtml}
      \`;

      if (step.type === 'instruction') {
        html += \`<button onclick="nextStep()">Next</button>\`;
      }
      else if (step.type === 'hardware_trigger') {
        html += \`
          <button id="startBtn">Start Sensor</button>
          <script>
            document.getElementById('startBtn').onclick = function() {
              this.style.display = 'none';
              startSensor('\${step.threshold}', () => {
                triggerFeedback('\${step.feedback || ''}');
                nextStep();
              });
            };
          </script>
        \`;
      }
      else if (step.type === 'quiz') {
        html += '<div class="quiz-options">';
        step.answer_options?.forEach((opt, i) => {
          html += \`
            <label>
              <input type="radio" name="quiz" value="\${i}">
              <span>\${opt}</span>
            </label>
          \`;
        });
        html += \`
          <button onclick="checkQuiz()">Submit</button>
          <div id="quizFeedback"></div>
        </div>
        <script>
          function checkQuiz() {
            const selected = document.querySelector('input[name="quiz"]:checked');
            if (!selected) return;
            const idx = parseInt(selected.value);
            const correct = \${step.correct_index ?? -1};
            const fb = document.getElementById('quizFeedback');
            if (idx === correct) {
              fb.innerHTML = '<p style="color:green">Correct!</p>';
              setTimeout(nextStep, 1200);
            } else {
              fb.innerHTML = '<p style="color:red">Try again</p>';
            }
          }
        </script>\`;
      }

      app.innerHTML = html;
    }

    function nextStep() {
      stepIndex++;
      render();
    }

    // Start
    render();
  </script>
</body>
</html>`;

// 3. Write the Output
fs.writeFileSync(outputPath, template(lesson));
console.log(`Successfully wrote: ${outputPath}`);
