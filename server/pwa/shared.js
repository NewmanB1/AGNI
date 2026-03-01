// shared.js - cached common code (factories, helpers)
// ES5 compatible — loaded by PWA shell on Android 6.0 Chrome 44 WebView

(function (root) {
  'use strict';

  function escapeAttr(val) {
    if (typeof val !== 'string') val = String(val == null ? '' : val);
    return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var svgGenerators = {
    circle: function (props) {
      return '<circle cx="' + escapeAttr(props.cx || 50) + '" cy="' + escapeAttr(props.cy || 50) + '" r="' + escapeAttr(props.r || 20) + '" fill="' + escapeAttr(props.fill || 'blue') + '" />';
    },
    rect: function (props) {
      return '<rect x="' + escapeAttr(props.x || 0) + '" y="' + escapeAttr(props.y || 0) + '" width="' + escapeAttr(props.width || 100) + '" height="' + escapeAttr(props.height || 100) + '" fill="' + escapeAttr(props.fill || 'green') + '" />';
    },
    line: function (props) {
      return '<line x1="' + escapeAttr(props.x1 || 0) + '" y1="' + escapeAttr(props.y1 || 0) + '" x2="' + escapeAttr(props.x2 || 100) + '" y2="' + escapeAttr(props.y2 || 100) + '" stroke="' + escapeAttr(props.stroke || 'black') + '" stroke-width="' + escapeAttr(props.width || 2) + '" />';
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { svgGenerators: svgGenerators, escapeAttr: escapeAttr };
  }

  if (typeof root.window !== 'undefined') {
    root.svgGenerators = svgGenerators;
    root.escapeAttr = escapeAttr;
    root.AGNI_SHARED_LOADED = true;
  }
})(typeof self !== 'undefined' ? self : this);
