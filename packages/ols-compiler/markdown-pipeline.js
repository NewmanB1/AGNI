'use strict';

// Markdown processing pipeline for OLS compiler.
// Uses remark/rehype to pre-render lesson step content at compile time.

const log = require('@agni/utils/logger').createLogger('config');

let processorPromise = null;

async function _buildProcessor() {
  const unified         = (await import('unified')).unified;
  const remarkParse     = (await import('remark-parse')).default;
  const remarkMath      = (await import('remark-math')).default;
  const remarkRehype    = (await import('remark-rehype')).default;
  const rehypeKatex     = (await import('rehype-katex')).default;
  const rehypeSanitize  = (await import('rehype-sanitize')).default;
  const rehypeStringify = (await import('rehype-stringify')).default;

  // P0 #6: Restrict href/src to allowlist (https, mailto) to prevent XSS and data: exhaustion
  const sanitizeSchema = {
    protocols: {
      href: ['https', 'mailto'],
      cite: ['https'],
      src: ['https']
    }
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype)
    // @ts-expect-error — rehype-katex options type does not match runtime API
    .use(rehypeKatex, {
      output: 'html',
      throwOnError: false,
      errorColor: '#ff6b35'
    })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);

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
  const processor = await _getProcessor();
  const result    = await processor.process(markdown);
  return String(result);
}

module.exports = { processMarkdown };
