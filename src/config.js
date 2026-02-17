// src/config.js – fixed destructuring + version check

let processorPromise = null;

async function getProcessor() {
  if (processorPromise) return processorPromise;

  processorPromise = (async () => {
    console.log("[config] Initializing remark processor (singleton)...");

    try {
      console.log("[config] → importing unified");
      const unifiedModule = await import('unified');
      console.log("[config] unified module:", Object.keys(unifiedModule));
      const { unified } = unifiedModule;
      console.log("[config] unified type:", typeof unified);

      console.log("[config] → importing remark-parse");
      const { default: remarkParse } = await import('remark-parse');

      console.log("[config] → importing remark-math");
      const { default: remarkMath } = await import('remark-math');

      console.log("[config] → importing remark-html");
      const { default: remarkHtml } = await import('remark-html');

      console.log("[config] All imports successful – building processor");

      // Critical: unified should be a function here
      if (typeof unified !== 'function') {
        throw new Error(`unified is not a function (got: ${typeof unified})`);
      }

      const processor = unified()
        .use(remarkParse)
        .use(remarkMath)
        .use(remarkHtml, { sanitize: false });

      console.log("[config] Processor ready");
      return processor;
    } catch (err) {
      console.error("[config] Failed to initialize remark processor:");
      console.error(err.stack || err.message);
      throw err;
    }
  })();

  return processorPromise;
}

module.exports = {
  async processMarkdown(text) {
    if (!text) return '';

    try {
      console.log("[config] processMarkdown: awaiting processor...");
      const processor = await getProcessor();

      console.log("[config] processMarkdown: processing text...");
      const result = await processor.process(text);
      const html = String(result);
      console.log("[config] processMarkdown: success");
      return html;
    } catch (err) {
      console.error("[config] processMarkdown failed:");
      console.error(err.message);
      return text.replace(/\n/g, '<br>'); // fallback
    }
  }
};
