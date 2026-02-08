const fs = require('fs');
const yaml = require('js-yaml');
const unified = require('unified');
const markdown = require('remark-parse');
const html = require('remark-html');

// 1. Read the Lesson
const lesson = yaml.load(fs.readFileSync('gravity.yaml', 'utf8'));

// 2. The Runtime Template (The "Player" Engine)
const template = (json) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: sans-serif; padding: 20px; text-align: center; }
    button { padding: 15px 30px; font-size: 1.2em; background: #007bff; color: white; border: none; border-radius: 8px; margin-top: 20px; }
    .hidden { display: none; }
    #debug { color: #666; font-size: 0.8em; margin-top: 20px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="debug">Waiting for sensor permissions...</div>

  <script>
    const lesson = ${JSON.stringify(json)};
    let stepIndex = 0;

    // Hardware Bridge
    function startSensor(threshold, onTrigger) {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(resp => {
          if (resp === 'granted') listen(threshold, onTrigger);
        }).catch(console.error);
      } else {
        listen(threshold, onTrigger);
      }
    }

    function listen(threshold, onTrigger) {
      window.addEventListener('devicemotion', (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        
        let val = 0;
        let triggered = false;

        // Simple Parser Logic
        if (threshold.includes('accel.z > 9.0')) {
          val = Math.abs(acc.z);
          if (val > 9.0) triggered = true;
        } 
        else if (threshold.includes('freefall')) {
          // Freefall = total acceleration near 0
          val = Math.hypot(acc.x, acc.y, acc.z);
          if (val < 1.0) triggered = true;
        }

        document.getElementById('debug').innerText = "Sensor: " + val.toFixed(2);
        
        if (triggered) {
          if (navigator.vibrate) navigator.vibrate(200);
          onTrigger();
        }
      });
    }

    // Rendering Engine
    function render() {
      const step = lesson.steps[stepIndex];
      const app = document.getElementById('app');
      
      // Convert Markdown (simple)
      app.innerHTML = "<h1>Step " + (stepIndex + 1) + "</h1>" + 
                      "<div>" + step.content.replace(/\\n/g, '<br>') + "</div>";

      if (step.type === 'instruction') {
        const btn = document.createElement('button');
        btn.innerText = "Next";
        btn.onclick = () => { stepIndex++; render(); };
        app.appendChild(btn);
      } 
      else if (step.type === 'hardware_trigger') {
        const btn = document.createElement('button');
        btn.innerText = "Start Sensor";
        btn.onclick = () => {
          btn.style.display = 'none';
          startSensor(step.threshold, () => {
             stepIndex++; render();
          });
        };
        app.appendChild(btn);
      }
    }
    
    render();
  </script>
</body>
</html>`;

// 3. Write the Output
fs.writeFileSync('gravity.html', template(lesson));
console.log("✅ Build Complete: gravity.html created!");
