// src/config.js – with logging to diagnose import issues

let unified;
let remarkParse;
let remarkMath;
let remarkHtml;

async function loadRemark() {
  console.log("[config] Starting lazy load of remark processors...");
  try {
    if (unified) {
      console.log("[config] Processors already loaded");
      return;
    }

    console.log("[config] Importing unified...");
    const u = await import('unified');
    unified = u.unified;
    console.log("[config] unified loaded");

    console.log("[config] Importing remark-parse...");
    const rp = await import('remark-parse');
    remarkParse = rp.default || rp;
    console.log("[config] remark-parse loaded");

    console.log("[config] Importing remark-math...");
    const rm = await import('remark-math');
    remarkMath = rm.default || rm;
    console.log("[config] remark-math loaded");

    console.log("[config] Importing remark-html...");
    const rh = await import('remark-html');
    remarkHtml = rh.default || rh;
    console.log("[config] remark-html loaded");

  } catch (err) {
    console.error("[config] Failed to load remark processors:");
    console.error(err.stack || err.message);
    throw err; // re-throw so caller sees it
  }
}

module.exports = {
  async processMarkdown(text) {
    if (!text) return '';

    try {
      console.log("[config] processMarkdown called – ensuring processors...");
      await loadRemark();

      if (!unified) {
        throw new Error("unified is still undefined after loadRemark()");
      }

      console.log("[config] Creating processor...");
      const processor = unified()
        .use(remarkParse)
        .use(remarkMath)
        .use(remarkHtml, { sanitize: false });

      console.log("[config] Processing text...");
      const file = await processor.process(text);
      const result = String(file);
      console.log("[config] Markdown processed successfully");
      return result;
    } catch (err) {
      console.error("[config] Markdown processing error:");
      console.error(err.message);
      console.error(err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : '');
      // Fallback: basic rendering
      return text.replace(/\n/g, '<br>');
    }
  }
};
