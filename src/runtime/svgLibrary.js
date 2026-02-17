// src/runtime/svgLibrary.js
// Reusable SVG generator functions (exported for use in player.js and potentially other runtimes)

export const svgGenerators = {
  circle: (props) => {
    const { cx = 50, cy = 50, r = 20, fill = 'blue' } = props || {};
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
  },

  rect: (props) => {
    const { x = 0, y = 0, width = 100, height = 100, fill = 'green' } = props || {};
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" />`;
  },

  line: (props) => {
    const { x1 = 0, y1 = 0, x2 = 100, y2 = 100, stroke = 'black', width = 2 } = props || {};
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" />`;
  },

  // Add more SVG types as needed (path, polygon, text, ellipse, etc.)
  // Example:
  // ellipse: (props) => { ... }
};
