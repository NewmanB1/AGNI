// src/config.js – async Markdown processor with dynamic ESM imports

let unified;
let remarkParse;
let remarkMath;
let remarkHtml;

async function loadRemark() {
  if (unified) return;

  const u = await import('unified');
  unified = u.unified;

  const rp = await import('remark-parse');
  remarkParse = rp.default || rp;

  const rm = await import('remark-math');
  remarkMath = rm.default || rm;

  const rh = await import('remark-html');
  remarkHtml = rh.default || rh;
}

module.exports = {
  async processMarkdown(text) {
    if (!text) return '';

    await loadRemark();

    const processor = unified()
      .use(remarkParse)
      .use(remarkMath)
      .use(remarkHtml, { sanitize: false });

    const file = await processor.process(text);
    return String(file);
  },

  // Optional sync wrapper (throws warning – prefer async)
  processMarkdownSync(text) {
    console.warn('[config] Sync Markdown processing is deprecated – use async version');
    throw new Error('Sync not supported anymore. Call await processMarkdown()');
  }
};
