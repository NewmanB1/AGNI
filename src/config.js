// src/config.js – using default export for unified + safer handling

let processorPromise = null;

async function getProcessor() {
  if (processorPromise) return processorPromise;

  processorPromise = (async () => {
    console.log("[config] Initializing remark processor (singleton)...");

    try {
      console.log("[config] → importing unified");
      const unifiedModule = await import('unified');
      console.log("[config] unified module keys:", Object.keys(unifiedModule));

      // Use default export (most reliable for unified v10+)
      const unified = unifiedModule.default || unifiedModule.unified;
      console.log("[config] unified type:", typeof unified);

      if (typeof unified !== 'function') {
        throw new Error(`unified is not callable (got: ${typeof unified})`);
      }

      console.log("[config] → importing remark-parse");
      const remarkParseModule = await import('remark-parse');
      const remarkParse = remarkParseModule.default || remarkParseModule;

      console.log("[config] → importing remark-math");
      const remarkMathModule = await import('remark-math');
      const remarkMath = remarkMathModule.default || remarkMathModule;

      console.log("[config] → importing remark-html");
      const remarkHtmlModule = await import('remark-html');
      const remarkHtml = remarkHtmlModule.default || remarkHtmlModule;

      console.log("[config] All imports successful – building processor");

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
      // Basic fallback
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }
  }
};
