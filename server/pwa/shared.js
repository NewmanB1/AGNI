// shared.js - cached common code (factories, helpers)

function escapeAttr(val) {
  if (typeof val !== 'string') val = String(val == null ? '' : val);
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const svgGenerators = {
  circle: (props) => `<circle cx="${escapeAttr(props.cx || 50)}" cy="${escapeAttr(props.cy || 50)}" r="${escapeAttr(props.r || 20)}" fill="${escapeAttr(props.fill || 'blue')}" />`,
  rect: (props) => `<rect x="${escapeAttr(props.x || 0)}" y="${escapeAttr(props.y || 0)}" width="${escapeAttr(props.width || 100)}" height="${escapeAttr(props.height || 100)}" fill="${escapeAttr(props.fill || 'green')}" />`,
  line: (props) => `<line x1="${escapeAttr(props.x1 || 0)}" y1="${escapeAttr(props.y1 || 0)}" x2="${escapeAttr(props.x2 || 100)}" y2="${escapeAttr(props.y2 || 100)}" stroke="${escapeAttr(props.stroke || 'black')}" stroke-width="${escapeAttr(props.width || 2)}" />`,
};

if (typeof module !== 'undefined') module.exports = { svgGenerators, escapeAttr };

window.AGNI_SHARED_LOADED = true;
