// shared.js - cached common code (factories, helpers)
// ES5 compatible — loaded by PWA shell on Android 7.0 Nougat Chrome 51 WebView

(function (root) {
  'use strict';

  function escapeAttr(val) {
    if (typeof val !== 'string') val = String(val == null ? '' : val);
    return val.replace(/\x00/g, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;');
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

  var SCRIPT_RE = /<script[\s>][\s\S]*?<\/script\s*>/gi;
  var EVENT_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
  var JS_URI_RE = /javascript\s*:/gi;

  function _decodeNumericEntities(str) {
    return str
      .replace(/&colon;/gi, ':')
      .replace(/&#x([0-9a-fA-F]+);/gi, function (match, hex) {
        var code = parseInt(hex, 16);
        if (code === 38 || code === 60 || code === 62 || code === 34 || code === 39) return match;
        return String.fromCharCode(code);
      })
      .replace(/&#(\d+);/g, function (match, dec) {
        var code = parseInt(dec, 10);
        if (code === 38 || code === 60 || code === 62 || code === 34 || code === 39) return match;
        return String.fromCharCode(code);
      });
  }

  function sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    var normalized = _decodeNumericEntities(html.replace(/\x00/g, ''));
    return normalized
      .replace(SCRIPT_RE, '')
      .replace(EVENT_RE, '')
      .replace(JS_URI_RE, '');
  }

  function setSafeHtml(element, html) {
    element.innerHTML = sanitizeHtml(html);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { svgGenerators: svgGenerators, escapeAttr: escapeAttr, sanitizeHtml: sanitizeHtml };
  }

  if (typeof root.window !== 'undefined') {
    root.svgGenerators = svgGenerators;
    root.escapeAttr = escapeAttr;
    root.AGNI_SHARED_LOADED = true;
    root.AGNI_SHARED = {
      setSafeHtml: setSafeHtml,
      sanitizeHtml: sanitizeHtml,
      escapeAttr: escapeAttr
    };
  }
})(typeof self !== 'undefined' ? self : this);
