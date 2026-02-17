// src/config.js
// Handles Markdown processing with remark ecosystem (ESM-compatible)

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');  // assuming you still need this elsewhere

let unified;
let remarkParse;
let remarkMath;
let remarkHtml;  // or remark-rehype + rehype-stringify if you switched

// Lazy-load ESM packages only when needed
async function loadProcessors() {
  if (!unified) {
    const u = await import('unified');
    unified = u.unified;

    const rp = await import('remark-parse');
    remarkParse = rp.default || rp;

    const rm = await import('remark-math');
    remarkMath = rm.default || rm;

    // If you're using remark-html (note: it's legacy; consider rehype-stringify instead)
    const rh = await import('remark-html');
    remarkHtml = rh.default || rh;
  }
  return { unified, remarkParse, remarkMath, remarkHtml };
}

// Export an async processor factory
module.exports = {
  async getMarkdownProcessor() {
    const { unified, remarkParse, remarkMath, remarkHtml } = await loadProcessors();

    return unified()
      .use(remarkParse)
      .use(remarkMath)
      .use(remarkHtml, { sanitize: false });  // or your options
  },

  // Keep your sync wrapper if some code expects it (but prefer async callers)
  processMarkdownSync(text) {
    // Warning: sync usage is deprecated in remark ecosystem
    console.warn("[DEPRECATED] Using sync Markdown processing – prefer async version");
    // This will throw if called before async load – so avoid if possible
    throw new Error("Sync processing no longer supported. Use processMarkdown async instead.");
  },

  // New async version (recommended)
  async processMarkdown(text) {
    if (!text) return '';
    const processor = await this.getMarkdownProcessor();
    const result = await processor.process(text);
    return String(result);
  }
};
