const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { unified } = require('unified');
const remarkParse = require('remark-parse');
const remarkHtml = require('remark-html');

// 1. Get the Input File (passed as argument)
const lessonFile = process.argv[2]; 
if (!lessonFile) {
    console.error("Usage: node src/compiler.js lessons/gravity.yaml");
    process.exit(1);
}

// 2. Read and Parse YAML
const fileContents = fs.readFileSync(lessonFile, 'utf8');
const data = yaml.load(fileContents);

console.log(`Compiling Lesson: ${data.meta.title}...`);

// 3. Helper: Convert Markdown to HTML
async function markdownToHtml(md) {
    if (!md) return "";
    const result = await unified()
        .use(remarkParse)
        .use(remarkHtml)
        .process(md);
    return result.toString();
}

// 4. Build the HTML Bundle
async function build() {
    // Process all steps to convert Markdown
    const processedSteps = await Promise.all(data.steps.map(async (step) => {
        if (step.content) {
            step.htmlContent = await markdownToHtml(step.content);
        }
        return step;
    }));

    // The "Player" Logic (Embedded JavaScript)
    // In a real build, this would be minified.
    const runtimeScript = `
        const lesson = ${JSON.stringify(data)};
        let currentStep = 0;

        function renderStep() {
            const step = lesson.steps[currentStep];
            const container = document.getElementById('app');
            
            let html = '<div class="step">';
            if (step.htmlContent) html += step.htmlContent;
