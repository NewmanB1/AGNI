// hub-transform.js - YAML → PWA on demand
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const express = require('express');

const app = express();
const port = 3000;

// Serve static PWA shell files
app.use(express.static(path.join(__dirname, 'pwa')));

// Lesson request handler
app.get('/lessons/:identifier', (req, res) => {
  const identifier = req.params.identifier;
  const yamlPath = path.join(__dirname, '..', 'lessons', identifier + '.yaml');

  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    const lesson = yaml.load(content);

    // Run inference (if you want)
    // const inferred = inferFeatures(lesson);

    // Convert to simple JSON + Markdown
    const lessonJson = {
      meta: lesson.meta,
      steps: lesson.steps.map(step => ({
        type: step.type,
        content: step.content,
        htmlContent: step.content, // placeholder - processMarkdown on client or here
        svg: step.type === 'svg' ? { type: step.svg_type, params: step.params } : null
      }))
    };

    // Send JSON (client renders it)
    res.json(lessonJson);
  } catch (err) {
    res.status(404).send('Lesson not found: ' + err.message);
  }
});

app.listen(port, () => {
  console.log(`Hub server running at http://localhost:${port}`);
});
