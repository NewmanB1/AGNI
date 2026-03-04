'use strict';

// Markdown processing pipeline for OLS compiler.
// Uses remark/rehype to pre-render lesson step content at compile time.

const log = require('@agni/utils/logger').createLogger('config');

var processorPromise = null;

async function _buildProcessor() {
  var unified         = (await import('unified')).unified;
  var remarkParse     = (await import('remark-parse')).default;
  var remarkMath      = (await import('remark-math')).default;
  var remarkRehype    = (await import('remark-rehype')).default;
  var rehypeKatex     = (await import('rehype-katex')).default;
  var rehypeStringify = (await import('rehype-stringify')).default;

  var processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex, {
      output: 'html',
      throwOnError: false,
      errorColor: '#ff6b35'
    })
    .use(rehypeStringify, {
      allowDangerousHtml: true
    });

  log.info('Markdown processor ready');
  return processor;
}

async function _getProcessor() {
  if (processorPromise) return processorPromise;

  processorPromise = _buildProcessor().catch(function (err) {
    processorPromise = null;
    throw err;
  });

  return processorPromise;
}

async function processMarkdown(markdown) {
  if (typeof markdown !== 'string') return '';
  var processor = await _getProcessor();
  var result    = await processor.process(markdown);
  return String(result);
}

module.exports = { processMarkdown };
