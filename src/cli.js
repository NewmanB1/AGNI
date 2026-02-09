const fs = require('fs');
const yaml = require('js-yaml');
const buildHtml = require('./builders/html');
const buildNative = require('./builders/native');

function run() {
  // Manual Argument Parsing (Keep dependencies low)
  const args = process.argv.slice(2);
  const params = {
    format: 'html', 
    inputFile: null,
    output: null,
    outputDir: null,
    deviceId: null,
    privateKey: null
  };

  args.forEach(arg => {
    if (arg.startsWith('--format=')) params.format = arg.split('=')[1];
    else if (arg.startsWith('--output=')) params.output = arg.split('=')[1];
    else if (arg.startsWith('--output-dir=')) params.outputDir = arg.split('=')[1];
    else if (arg.startsWith('--device-id=')) params.deviceId = arg.split('=')[1];
    else if (arg.startsWith('--private-key=')) params.privateKey = arg.split('=')[1];
    else if (!arg.startsWith('-')) params.inputFile = arg;
  });

  if (!params.inputFile) {
    console.error("Usage: agni <input.yaml> [options]");
    process.exit(1);
  }

  // Load Data
  const raw = fs.readFileSync(params.inputFile, 'utf8');
  const data = yaml.load(raw);

  // Dispatch Strategy
  if (params.format === 'html') {
    if (!params.output) throw new Error("--output required for HTML format");
    buildHtml(data, params);
  } else if (params.format === 'native') {
    if (!params.outputDir) throw new Error("--output-dir required for Native format");
    buildNative(data, params);
  }
}

module.exports = { run };
