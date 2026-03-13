'use strict';

/**
 * LTI (Learning Tools Interoperability) routes for Moodle, Canvas, and other LMS.
 * Supports LTI 1.1 launch and Deep Linking (Content Item selection).
 * See docs/playbooks/lms-plugins.md.
 */

const crypto = require('crypto');
const querystring = require('querystring');

const envConfig = require('@agni/utils/env-config');
const { readBody } = require('@agni/utils/http-helpers');

function register(router, ctx) {
  const { loadLessonIndexAsync } = ctx;

  function getBaseUrl(req) {
    const hubUrl = envConfig.homeUrl || process.env.AGNI_HUB_URL || '';
    if (hubUrl) return hubUrl.replace(/\/$/, '');
    const host = req.headers.host || 'localhost:8082';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return proto + '://' + host;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Validate LTI 1.1 OAuth signature (HMAC-SHA1).
   * Returns true if valid or if LTI secret not configured (dev mode).
   */
  function validateOAuthSignature(req, body, launchUrl) {
    const secret = envConfig.ltiSecret || process.env.AGNI_LTI_SECRET || '';
    if (!secret) return true;

    const receivedSig = body.oauth_signature;
    if (!receivedSig) return false;

    try {
      const baseString = buildOAuthBaseString(req.method, launchUrl, body);
      const consumerSecret = secret;
      const key = querystring.escape(consumerSecret) + '&';
      const hmac = crypto.createHmac('sha1', key);
      hmac.update(baseString);
      const expectedSig = hmac.digest('base64');

      const a = Buffer.from(receivedSig, 'utf8');
      const b = Buffer.from(expectedSig, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) {
      return false;
    }
  }

  function buildOAuthBaseString(method, url, params) {
    const copy = { ...params };
    delete copy.oauth_signature;
    const sorted = Object.keys(copy).sort();
    const pairs = sorted.map(function (k) {
      return querystring.escape(k) + '=' + querystring.escape(String(copy[k]));
    });
    return method.toUpperCase() + '&' + querystring.escape(url) + '&' + querystring.escape(pairs.join('&'));
  }

  /**
   * POST /lti/launch
   * LTI 1.1 launch (basic or Deep Link). Expects application/x-www-form-urlencoded.
   */
  router.post('/lti/launch', async function (req, res, { sendResponse }) {
    const baseUrl = getBaseUrl(req);
    const launchUrl = baseUrl + '/lti/launch';

    const rawBody = await readBody(req).catch(function () { return ''; });
    const body = querystring.parse(rawBody);

    if (!validateOAuthSignature(req, body, launchUrl)) {
      return sendResponse(401, { error: 'Invalid LTI signature' });
    }

    const ltiMessageType = body.lti_message_type || body.ltiMessageType || '';
    const isDeepLink = ltiMessageType === 'ContentItemSelectionRequest' || ltiMessageType.indexOf('ContentItemSelection') !== -1;
    const returnUrl = body.content_item_return_url || body.launch_presentation_return_url || '';

    const lessons = await loadLessonIndexAsync().catch(function () { return []; });
    const catalog = lessons.map(function (l) {
      return {
        slug: l.slug || l.lessonId,
        title: l.title || l.slug || 'Untitled',
        description: l.description || ''
      };
    });

    if (isDeepLink && returnUrl) {
      // Deep Link: render picker that posts Content Item back to LMS
      const itemsJson = JSON.stringify(catalog);
      const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Select OLS Lesson</title><style>' +
        'body{font-family:system-ui,sans-serif;margin:1rem;max-width:600px}' +
        'h1{font-size:1.2rem}.lesson{display:block;padding:0.75rem;margin:0.5rem 0;border:1px solid #ccc;border-radius:8px;cursor:pointer;text-decoration:none;color:inherit}' +
        '.lesson:hover{background:#f5f5f5}.lesson strong{display:block}.lesson small{color:#666;font-size:0.9em}</style></head><body>' +
        '<h1>Select a lesson</h1>' +
        '<div id="list"></div>' +
        '<script>var catalog=' + itemsJson.replace(/<\//g, '<\\/') + ';var returnUrl=' + JSON.stringify(returnUrl) + ';' +
        'var baseUrl=' + JSON.stringify(baseUrl) + ';' +
        'var list=document.getElementById("list");' +
        'catalog.forEach(function(l){' +
        'var a=document.createElement("a");a.className="lesson";a.href="#";' +
        'a.innerHTML="<strong>"+l.title+"</strong><small>"+(l.description||"")+"</small>";' +
        'a.onclick=function(e){e.preventDefault();' +
        'var form=document.createElement("form");form.method="POST";form.action=returnUrl;' +
        'var input=document.createElement("input");input.type="hidden";input.name="content_items";' +
        'input.value=JSON.stringify({"@graph":[{"@type":"LtiLinkItem","url":baseUrl+"/lessons/"+encodeURIComponent(l.slug),"title":l.title,"mediaType":"text/html"}]});' +
        'form.appendChild(input);document.body.appendChild(form);form.submit();};' +
        'list.appendChild(a);});</script></body></html>';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(html);
      return undefined;
    }

    // Basic launch: redirect to first lesson or show picker
    if (catalog.length === 0) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>No lessons</title></head><body><p>No OLS lessons available.</p></body></html>');
      return undefined;
    }

    const firstSlug = catalog[0].slug;
    const pickerHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>OLS Lessons</title><style>body{font-family:system-ui,sans-serif;margin:1rem;max-width:600px}' +
      'h1{font-size:1.2rem}.lesson{display:block;padding:0.75rem;margin:0.5rem 0;border:1px solid #ccc;border-radius:8px;text-decoration:none;color:inherit;background:#fff}' +
      '.lesson:hover{background:#f5f5f5}.lesson strong{display:block}.lesson small{color:#666;font-size:0.9em}</style></head><body>' +
      '<h1>Choose a lesson</h1>' +
      catalog.map(function (l) {
        var url = baseUrl + '/lessons/' + encodeURIComponent(l.slug);
        return '<a class="lesson" href="' + escapeHtml(url) + '"><strong>' + escapeHtml(l.title) + '</strong><small>' + escapeHtml(l.description || '') + '</small></a>';
      }).join('') +
      '</body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(pickerHtml);
    return undefined;
  });

  /**
   * GET /lti/xml
   * LTI 1.1 XML descriptor for tool registration (Moodle, Canvas).
   */
  router.get('/lti/xml', function (req, res) {
    const baseUrl = getBaseUrl(req);
    const launchUrl = baseUrl + '/lti/launch';
    const secureUrl = launchUrl.indexOf('https') === 0 ? launchUrl : launchUrl.replace(/^http:/, 'https:');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p0" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0">' +
      '<blti:title>OLS Lessons</blti:title>' +
      '<blti:description>Open Lesson Standard - sensor-rich, offline-capable lessons</blti:description>' +
      '<blti:launch_url>' + escapeHtml(launchUrl) + '</blti:launch_url>' +
      '<blti:secure_launch_url>' + escapeHtml(secureUrl) + '</blti:secure_launch_url>' +
      '</cartridge_basiclti_link>';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.writeHead(200);
    res.end(xml);
    return undefined;
  });

  /**
   * GET /lti/lessons
   * JSON lesson catalog for LTI tool (no hub key required).
   */
  router.get('/lti/lessons', async function (req, res, { sendResponse }) {
    const baseUrl = getBaseUrl(req);
    const lessons = await loadLessonIndexAsync().catch(function () { return []; });
    const items = lessons.map(function (l) {
      return {
        slug: l.slug || l.lessonId,
        title: l.title || l.slug || 'Untitled',
        description: l.description || '',
        url: baseUrl + '/lessons/' + encodeURIComponent(l.slug || l.lessonId)
      };
    });
    return sendResponse(200, { lessons: items });
  });
}

module.exports = { register };
