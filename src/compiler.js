const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { unified } = require('unified');
const remarkParse = require('remark-parse');
const remarkHtml = require('remark-html');

// 1. Get the Input File
const lessonFile = process.argv[2]; 
if (!lessonFile) {
    console.error("Usage: node src/compiler.js lessons/gravity.yaml");
    process.exit(1);
}

// 2. Read and Parse YAML
const fileContents = fs.readFileSync(lessonFile, 'utf8');
const data = yaml.load(fileContents);
const outputName = path.basename(lessonFile, '.yaml') + '.html';

console.log(`🏭 Compiling Lesson: ${data.meta.title}`);

// 3. Helper: Convert Markdown to HTML
async function markdownToHtml(md) {
    if (!md) return "";
    const result = await unified()
        .use(remarkParse)
        .use(remarkHtml)
        .process(md);
    return result.toString();
}

// 4. The Runtime Template (The "Player" that runs on the phone)
const generateRuntime = (lessonJson) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${lessonJson.meta.title}</title>
    <style>
        body { font-family: system-ui, sans-serif; padding: 20px; background: #f4f4f4; }
        .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        button { background: #007bff; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 8px; width: 100%; margin-top: 20px; }
        button:disabled { background: #ccc; }
        .hidden { display: none; }
        .sensor-status { margin-top: 10px; font-weight: bold; color: #666; }
    </style>
</head>
<body>
    <div id="app" class="card">
        <h1>Loading...</h1>
    </div>

    <script>
        const lesson = ${JSON.stringify(lessonJson)};
        let currentStepIndex = 0;
        let sensorActive = false;

        // --- HARDWARE ABSTRACTION LAYER (HAL) ---
        function triggerHaptic(pattern) {
            if (navigator.vibrate) {
                // Parse pattern: "heavy_thud" -> [50, 50, 200]
                const patterns = {
                    "heavy_thud": [50, 50, 200],
                    "success": [100, 50, 100]
                };
                navigator.vibrate(patterns[pattern] || 200);
            }
        }

        // --- THRESHOLD PARSER ---
        function checkThreshold(reading, thresholdStr) {
            // Regex from Schema v1.5.1
            const regex = /^([a-z\\.]+)\\s*(>|<|>=|<=|==)\\s*(-?[0-9\\.]+)(g|ms|s|deg|db|lux|m\\/s2)?$/;
            const match = thresholdStr.match(regex);
            if (!match) return false;

            const [_, subject, operator, value] = match;
            const numValue = parseFloat(value);
            
            // Logic: freefall (accel.total < 0.2)
            if (subject === 'freefall') {
                // "freefall" logic is inverted: reading must be LESS than 0.2g
                // But the Lesson says "freefall > 0.15s" (Duration)
                // For this V1 compiler, we simply check if reading < 0.2
                return reading < 0.2; 
            }
            return false;
        }

        // --- RENDERER ---
        function renderStep() {
            const step = lesson.steps[currentStepIndex];
            const app = document.getElementById('app');
            
            let html = '<div class="step-content">' + (step.htmlContent || step.content) + '</div>';
            
            if (step.type === 'instruction') {
                html += '<button onclick="nextStep()">Next</button>';
            } 
            else if (step.type === 'hardware_trigger') {
                html += '<div class="sensor-status" id="sensor-debug">Waiting for action...</div>';
                startSensorListener(step);
            }
            else if (step.type === 'quiz') {
                 step.answer_options.forEach((opt, idx) => {
                    html += '<button onclick="checkAnswer(' + idx + ')">' + opt + '</button>';
                 });
            }

            app.innerHTML = html;
        }

        function nextStep() {
            if (currentStepIndex < lesson.steps.length - 1) {
                currentStepIndex++;
                renderStep();
            } else {
                document.getElementById('app').innerHTML = "<h1>Lesson Complete! 🎉</h1>";
                triggerHaptic("success");
            }
        }

        function checkAnswer(idx) {
            const step = lesson.steps[currentStepIndex];
            if (idx === step.correct_index) {
                triggerHaptic("success");
                nextStep();
            } else {
                navigator.vibrate(500); // Error buzz
                alert("Try again!");
            }
        }

        function startSensorListener(step) {
            if (sensorActive) return;
            sensorActive = true;
            
            // Listen for Accelerometer
            window.addEventListener('devicemotion', (event) => {
                if (currentStepIndex !== lesson.steps.indexOf(step)) return;

                const acc = event.accelerationIncludingGravity;
                const totalG = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z) / 9.8;
                
                document.getElementById('sensor-debug').innerText = "G-Force: " + totalG.toFixed(2);

                if (checkThreshold(totalG, step.threshold)) {
                    triggerHaptic(step.feedback);
                    sensorActive = false;
                    nextStep();
                }
            });
        }

        // --- INIT ---
        renderStep();
    </script>
</body>
</html>
`;

// 5. Execution
async function build() {
    // Convert Markdown for all steps
    for (let step of data.steps) {
        if (step.content) {
            step.htmlContent = await markdownToHtml(step.content);
        }
    }
    
    const finalHtml = generateRuntime(data);
    fs.writeFileSync(outputName, finalHtml);
    console.log(`✅ Success! Generated: ${outputName}`);
}

build();
