const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkMath = require('remark-math');
const remarkHtml = require('remark-html');

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkHtml, { sanitize: false });

module.exports = {
  processMarkdown: (text) => markdownProcessor.processSync(text || '').toString()
};
