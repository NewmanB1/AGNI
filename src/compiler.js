const fs = require('fs');
const yaml = require('js-yaml');
const unified = require('unified');
const markdown = require('remark-parse');
const remarkMath = require('remark-math');
const html = require('remark-html');
const rehypeKatex = require('rehype-katex');
const rehypeStringify = require('rehype-stringify');
const path = require('path');
const { Buffer } = require('buffer');

// 1. Parse command line args
const args = process.argv.slice(2);
const lessonPath = args[0] || 'lessons/gravity.yaml';
const formatIndex = args.indexOf('--format');
const format = formatIndex !== -1 ? args[formatIndex + 1] : 'html';
let outputPath = 'dist/gravity.html';
const outputIndex = args.indexOf('--output');
if (outputIndex !== -1 && args[outputIndex + 1]) {
  outputPath = args[outputIndex + 1];
}
let outputDir = path.dirname(outputPath);
if (format === 'native') {
  outputDir = args.find(arg => arg.startsWith('--output-dir=')) ? args.find(arg => arg.startsWith('--output-dir=')).split('=')[1] : 'dist/native-gravity';
}

// Create output dir
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Created output directory: ${outputDir}`);
}

// 2. Read and process the lesson
const lesson = yaml.load(fs.readFileSync(lessonPath, 'utf8'));

// Pre-render markdown content to HTML (with math support)
const processor = unified()
  .use(markdown)
  .use(remarkMath)
  .use(html)
  .use(rehypeKatex)
  .use(rehypeStringify);

lesson.steps.forEach(step => {
  if (step.content) {
    const rendered = processor.processSync(step.content).toString();
    step.renderedContent = rendered;
  }
});

// 3. Handle different formats
if (format === 'html') {
  // HTML template - built with concatenation to avoid ${} parse issues
  const template = (json) => {
    return '<!DOCTYPE html>\n' +
      '<html lang="' + (json.meta?.language || 'en') + '">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>' + (json.meta?.title || 'OLS Lesson') + '</title>\n' +
      '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.css" integrity="sha384-vKruj+a13U8yHIkOyAwoyg9i14pEsNza92LBzEVi1g=" crossorigin="anonymous">\n' +
      '  <style>\n' +
      '    body { font-family: system-ui, sans-serif; padding: 20px; max-width: 700px; margin: 0 auto; line-height: 1.6; background: #f9f9f9; }\n' +
      '    h1, h2, h3 { color: #1a3c5e; }\n' +
      '    button { padding: 14px 28px; font-size: 1.1em; background: #0066cc; color: white; border: none; border-radius: 8px; cursor: pointer; margin: 16px 8px 8px 0; }\n' +
      '    button:hover { background: #0052a3; }\n' +
      '    .progress { font-size: 0.95em; color: #555; margin: 12px 0; }\n' +
      '    .quiz-options label { display: block; margin: 12px 0; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }\n' +
      '    .quiz-options input:checked + span { font-weight: bold; color: #0066cc; }\n' +
      '    #debug { font-size: 0.85em; color: #777; margin-top: 20px; font-family: monospace; }\n' +
      '    .flash { animation: flash 0.6s; }\n' +
      '    @keyframes flash { 0% { background: #ffff99; } 100% { background: transparent; } }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div id="app"></div>\n' +
      '  <div id="debug">Waiting for sensor permissions...</div>\n' +
      '\n' +
      '  <script>\n' +
      '    const lesson = JSON.parse(atob(\'' + Buffer.from(JSON.stringify(json)).toString('base64') + '\'));\n' +
      '    let stepIndex = 0;\n' +
      '    let freefallStart = null;\n' +
      '\n' +
      '    const vibrationPatterns = {\n' +
      '      short: 200,\n' +
      '      success: [100, 50, 100, 50, 200],\n' +
      '      success_pattern: [80, 40, 80, 40, 300],\n' +
      '      long: 800\n' +
      '    };\n' +
      '\n' +
      '    function flashScreen() {\n' +
      '      document.body.classList.add(\'flash\');\n' +
      '      setTimeout(() => document.body.classList.remove(\'flash\'), 600);\n' +
      '    }\n' +
      '\n' +
      '    function triggerFeedback(feedback = \'\') {\n' +
      '      const pattern = vibrationPatterns[feedback.replace(\'vibration:\', \'\')] || 300;\n' +
      '      if (navigator.vibrate) {\n' +
      '        navigator.vibrate(pattern);\n' +
      '      } else {\n' +
      '        flashScreen();\n' +
      '      }\n' +
      '    }\n' +
      '\n' +
      '    function startSensor(threshold, onTrigger) {\n' +
      '      const debugEl = document.getElementById(\'debug\');\n' +
      '\n' +
      '      function listen(event) {\n' +
      '        const acc = event.accelerationIncludingGravity;\n' +
      '        if (!acc) return;\n' +
      '\n' +
      '        const total = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);\n' +
      '        let triggered = false;\n' +
      '\n' +
      '        if (threshold.includes(\'accel.z >\')) {\n' +
      '          const val = parseFloat(threshold.split(\'>\')[1].trim());\n' +
      '          if (Math.abs(acc.z) > val) triggered = true;\n' +
      '        }\n' +
      '        else if (threshold.includes(\'accel.total <\')) {\n' +
      '          const val = parseFloat(threshold.split(\'<\')[1].trim());\n' +
      '          if (total < val) triggered = true;\n' +
      '        }\n' +
      '        else if (threshold.includes(\'freefall\')) {\n' +
      '          const match = threshold.match(/freefall\\s*>\\s*([\\d.]+)s?/);\n' +
      '          const durationMs = match ? parseFloat(match[1]) * 1000 : 300;\n' +
      '\n' +
      '          if (total < 1.5) {\n' +
      '            if (!freefallStart) freefallStart = Date.now();\n' +
      '            if (Date.now() - freefallStart >= durationMs) {\n' +
      '              triggered = true;\n' +
      '              freefallStart = null;\n' +
      '            }\n' +
      '          } else {\n' +
      '            freefallStart = null;\n' +
      '          }\n' +
      '        }\n' +
      '\n' +
      '        debugEl.innerText = `Accel: total=${total.toFixed(2)} m/s² | z=${(acc.z || 0).toFixed(2)} | triggered=${triggered}`;\n' +
      '\n' +
      '        if (triggered) {\n' +
      '          onTrigger();\n' +
      '          window.removeEventListener(\'devicemotion\', listen);\n' +
      '        }\n' +
      '      }\n' +
      '\n' +
      '      if (typeof DeviceMotionEvent.requestPermission === \'function\') {\n' +
      '        DeviceMotionEvent.requestPermission()\n' +
      '          .then(perm => {\n' +
      '            if (perm === \'granted\') {\n' +
      '              window.addEventListener(\'devicemotion\', listen);\n' +
      '            } else {\n' +
      '              debugEl.innerText = \'Motion permission denied\';\n' +
      '            }\n' +
      '          })\n' +
      '          .catch(err => {\n' +
      '            debugEl.innerText = \'Permission error: \' + err.message;\n' +
      '          });\n' +
      '      } else {\n' +
      '        window.addEventListener(\'devicemotion\', listen);\n' +
      '      }\n' +
      '    }\n' +
      '\n' +
      '    function render() {\n' +
      '      const app = document.getElementById(\'app\');\n' +
      '      const step = lesson.steps[stepIndex];\n' +
      '      if (!step) {\n' +
      '        app.innerHTML = \'<h1>Lesson Complete!</h1><p>Congratulations!</p>\';\n' +
      '        return;\n' +
      '      }\n' +
      '\n' +
      '      let html = `\n' +
      '        <h1>${lesson.meta?.title || \'Lesson\'}</h1>\n' +
      '        <div class="progress">Step ${stepIndex + 1} of ${lesson.steps.length}</div>\n' +
      '        ${step.renderedContent || \'\'}\n' +
      '      `;\n' +
      '\n' +
      '      if (step.type === \'instruction\') {\n' +
      '        html += `<button onclick="nextStep()">Next</button>`;\n' +
      '      } else if (step.type === \'hardware_trigger\') {\n' +
      '        html += `\n' +
      '          <button id="startBtn">Start Sensor</button>\n' +
      '          <script>\n' +
      '            document.getElementById(\'startBtn\').onclick = function() {\n' +
      '              this.style.display = \'none\';\n' +
      '              startSensor(\'${step.threshold}\', () => {\n' +
      '                triggerFeedback(\'${step.feedback || \'\'}\');\n' +
      '                nextStep();\n' +
      '              });\n' +
      '            };\n' +
      '          </script>\n' +
      '        `;\n' +
      '      } else if (step.type === \'quiz\') {\n' +
      '        html += \'<div class="quiz-options">\';\n' +
      '        step.answer_options?.forEach((opt, i) => {\n' +
      '          html += `\n' +
      '            <label>\n' +
      '              <input type="radio" name="quiz" value="${i}">\n' +
      '              <span>${opt}</span>\n' +
      '            </label>\n' +
      '          `;\n' +
      '        });\n' +
      '        html += `\n' +
      '          <button onclick="checkQuiz()">Submit</button>\n' +
      '          <div id="quizFeedback"></div>\n' +
      '        </div>\n' +
      '        <script>\n' +
      '          function checkQuiz() {\n' +
      '            const selected = document.querySelector(\'input[name="quiz"]:checked\');\n' +
      '            if (!selected) return;\n' +
      '            const idx = parseInt(selected.value);\n' +
      '            const correct = ${step.correct_index ?? -1};\n' +
      '            const fb = document.getElementById(\'quizFeedback\');\n' +
      '            if (idx === correct) {\n' +
      '              fb.innerHTML = \'<p style="color:green">Correct!</p>\';\n' +
      '              setTimeout(nextStep, 1200);\n' +
      '            } else {\n' +
      '              fb.innerHTML = \'<p style="color:red">Try again</p>\';\n' +
      '            }\n' +
      '          }\n' +
      '        </script>`;\n' +
      '      }\n' +
      '\n' +
      '      app.innerHTML = html;\n' +
      '    }\n' +
      '\n' +
      '    function nextStep() {\n' +
      '      stepIndex++;\n' +
      '      render();\n' +
      '    }\n' +
      '\n' +
      '    render();\n' +
      '  </script>\n' +
      '</body>\n' +
      '</html>';
  };

  // Write HTML
  fs.writeFileSync(outputPath, template(lesson));
  console.log(`Successfully wrote HTML: ${outputPath}`);
} else if (format === 'native') {
  const jsonPath = path.join(outputDir, 'lesson.json');
  const mdPath = path.join(outputDir, 'lesson.md');

  fs.writeFileSync(jsonPath, JSON.stringify(lesson, null, 2));
  let mdContent = `# ${lesson.meta.title}\n\n`;
  lesson.steps.forEach((step, i) => {
    mdContent += `## Step ${i+1} (${step.type})\n${step.content || ''}\n\n`;
  });
  fs.writeFileSync(mdPath, mdContent);
  console.log(`Successfully wrote native JSON: ${jsonPath} and MD: ${mdPath}`);
} else {
  console.error(`Unknown format: ${format}`);
}
