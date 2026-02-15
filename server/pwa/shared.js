// shared.js - cached common code (factories, helpers)
const svgGenerators = {
  circle: (props) => `<circle cx="${props.cx || 50}" cy="${props.cy || 50}" r="${props.r || 20}" fill="${props.fill || 'blue'}" />`,
  rect: (props) => `<rect x="${props.x || 0}" y="${props.y || 0}" width="${props.width || 100}" height="${props.height || 100}" fill="${props.fill || 'green'}" />`,
  line: (props) => `<line x1="${props.x1 || 0}" y1="${props.y1 || 0}" x2="${props.x2 || 100}" y2="${props.y2 || 100}" stroke="${props.stroke || 'black'}" stroke-width="${props.width || 2}" />`,
  // Add more generators as needed
};

// Export for module usage if needed
if (typeof module !== 'undefined') module.exports = { svgGenerators };

// Global flag
window.AGNI_SHARED_LOADED = true;
