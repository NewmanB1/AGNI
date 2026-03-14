'use strict';

/**
 * LTI (Learning Tools Interoperability) routes for Moodle, Canvas, and other LMS.
 * Supports LTI 1.1 launch, Deep Linking (Content Item selection), and Basic Outcomes
 * grade passback. See docs/playbooks/lms-plugins.md.
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const querystring = require('querystring');
const { URL } = require('url');

const envConfig = require('@agni/utils/env-config');
const { readBody } = require('@agni/utils/http-helpers');

// In-memory store for LTI outcome params (token -> { outcomeServiceUrl, sourcedId, consumerKey }).
// TTL 24h; tokens are single-use for grade submission.
const OUTCOME_TTL_MS = 24 * 60 * 60 * 1000;
const _outcomeStore = new Map();
const _outcomeStoreTime = new Map();

function pruneOutcomeStore() {
  const now = Date.now();
  for (const [k, t] of _outcomeStoreTime) {
    if (now - t > OUTCOME_TTL_MS) {
      _outcomeStore.delete(k);
      _outcomeStoreTime.delete(k);
    }
  }
}

/**
 * LTI 1.1 Basic Outcomes replaceResult: POST grade (0–1) to LMS.
 * Uses OAuth 1.0a body hash signing per IMS spec.
 * @returns {Promise<string|null>} Error message or null on success
 */
function replaceResult(outcomeServiceUrl, sourcedId, consumerKey, consumerSecret, score) {
  const msgId = 'lti-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const scoreStr = String(Math.round(score * 100) / 100);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">' +
    '<imsx_POXHeader><imsx_POXRequestHeaderInfo><imsx_version>V1.0</imsx_version><imsx_messageIdentifier>' +
    msgId + '</imsx_messageIdentifier></imsx_POXRequestHeaderInfo></imsx_POXHeader>' +
    '<imsx_POXBody><replaceResultRequest><resultRecord><sourcedGUID><sourcedId>' +
    sourcedId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</sourcedId></sourcedGUID><result><resultScore><language>en</language><textString>' +
    scoreStr + '</textString></resultScore></result></resultRecord></replaceResultRequest></imsx_POXBody>' +
    '</imsx_POXEnvelopeRequest>';

  const bodyHash = crypto.createHash('sha1').update(xml, 'utf8').digest('base64');
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(8).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    oauth_body_hash: bodyHash
  };
  const baseString = 'POST&' + querystring.escape(outcomeServiceUrl) + '&' +
    querystring.escape(Object.keys(oauthParams).sort().map(function (k) {
      return querystring.escape(k) + '=' + querystring.escape(String(oauthParams[k]));
    }).join('&'));
  const key = querystring.escape(consumerSecret) + '&';
  oauthParams.oauth_signature = crypto.createHmac('sha1', key).update(baseString).digest('base64');

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(function (k) {
    return querystring.escape(k) + '="' + querystring.escape(String(oauthParams[k])) + '"';
  }).join(', ');

  return new Promise(function (resolve) {
    const url = new URL(outcomeServiceUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': authHeader,
        'Content-Length': Buffer.byteLength(xml, 'utf8')
      }
    };
    const req = client.request(opts, function (res) {
      let body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        const match = body.match(/imsx_codeMajor[^>]*>([^<]+)</);
        const codeMajor = match ? match[1].trim() : '';
        if (codeMajor === 'success') {
          resolve(null);
        } else {
          const descMatch = body.match(/imsx_description[^>]*>([^<]+)/);
          resolve(descMatch ? descMatch[1].trim() : 'replaceResult failed');
        }
      });
    });
    req.on('error', function (e) { resolve(e.message); });
    req.setTimeout(10000, function () { req.destroy(); resolve('Timeout'); });
    req.write(xml, 'utf8');
    req.end();
  });
}

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

    // LTI 1.1 Basic Outcomes: store outcome params for grade passback when LMS provides them
    let gradeToken = null;
    const outcomeUrl = body.lis_outcome_service_url || '';
    const sourcedId = body.lis_result_sourcedid || '';
    const consumerKey = body.oauth_consumer_key || '';
    const secret = envConfig.ltiSecret || process.env.AGNI_LTI_SECRET || '';
    if (outcomeUrl && sourcedId && consumerKey && secret) {
      pruneOutcomeStore();
      gradeToken = crypto.randomBytes(16).toString('hex');
      _outcomeStore.set(gradeToken, { outcomeServiceUrl: outcomeUrl, sourcedId: sourcedId, consumerKey: consumerKey });
      _outcomeStoreTime.set(gradeToken, Date.now());
    }

    const tokenParam = gradeToken ? '?token=' + encodeURIComponent(gradeToken) : '';
    const pickerHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>OLS Lessons</title><style>body{font-family:system-ui,sans-serif;margin:1rem;max-width:600px}' +
      'h1{font-size:1.2rem}.lesson{display:block;padding:0.75rem;margin:0.5rem 0;border:1px solid #ccc;border-radius:8px;text-decoration:none;color:inherit;background:#fff}' +
      '.lesson:hover{background:#f5f5f5}.lesson strong{display:block}.lesson small{color:#666;font-size:0.9em}</style></head><body>' +
      '<h1>Choose a lesson</h1>' +
      catalog.map(function (l) {
        var url = gradeToken
          ? baseUrl + '/lti/lesson/' + encodeURIComponent(l.slug) + tokenParam
          : baseUrl + '/lessons/' + encodeURIComponent(l.slug);
        return '<a class="lesson" href="' + escapeHtml(url) + '"><strong>' + escapeHtml(l.title) + '</strong><small>' + escapeHtml(l.description || '') + '</small></a>';
      }).join('') +
      '</body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(pickerHtml);
    return undefined;
  });

  /**
   * GET /lti/lesson/:slug
   * Wrapper page that embeds the lesson in an iframe and listens for ols.lessonComplete
   * postMessage to submit grade to the LMS via LTI Basic Outcomes.
   */
  router.get('/lti/lesson/:slug', function (req, res, { params, qs }) {
    const slug = params.slug;
    const token = qs.token || '';
    const baseUrl = getBaseUrl(req);
    const lessonUrl = baseUrl + '/lessons/' + encodeURIComponent(slug);
    const submitUrl = baseUrl + '/lti/submit-grade';
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>OLS Lesson</title><style>body{margin:0;overflow:hidden}#frame{width:100%;height:100vh;border:none}#status{margin:0.5rem;font-family:sans-serif;font-size:0.9em;color:#666}</style></head><body>' +
      '<div id="status"></div>' +
      '<iframe id="frame" src="' + escapeHtml(lessonUrl) + '" title="Lesson"></iframe>' +
      '<script>' +
      '(function(){' +
      'var token=' + JSON.stringify(token) + ';' +
      'var submitUrl=' + JSON.stringify(submitUrl) + ';' +
      'var status=document.getElementById("status");' +
      'if(!token){return;}' +
      'window.addEventListener("message",function(e){' +
      'if(e.data&&e.data.type==="ols.lessonComplete"&&typeof e.data.mastery==="number"){' +
      'status.textContent="Submitting grade...";' +
      'fetch(submitUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token,score:Math.max(0,Math.min(1,e.data.mastery))})})' +
      '.then(function(r){return r.json();})' +
      '.then(function(data){' +
      'if(data.ok){status.textContent="Grade submitted.";}else{status.textContent="Grade submit failed.";}' +
      '})' +
      '.catch(function(){status.textContent="Grade submit failed.";});' +
      '}' +
      '});' +
      '})();' +
      '</script></body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(html);
    return undefined;
  });

  /**
   * POST /lti/submit-grade
   * Accepts { token, score } and submits to LMS via LTI 1.1 Basic Outcomes replaceResult.
   */
  router.post('/lti/submit-grade', async function (req, res, { sendResponse }) {
    const raw = await readBody(req).catch(function () { return '{}'; });
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return sendResponse(400, { ok: false, error: 'Invalid JSON' });
    }
    const token = payload.token;
    let score = payload.score;
    if (!token || typeof score !== 'number') {
      return sendResponse(400, { ok: false, error: 'Missing token or score' });
    }
    score = Math.max(0, Math.min(1, score));
    if (Number.isNaN(score)) {
      return sendResponse(400, { ok: false, error: 'Invalid score' });
    }

    const entry = _outcomeStore.get(token);
    if (!entry) {
      return sendResponse(404, { ok: false, error: 'Token expired or invalid' });
    }
    _outcomeStore.delete(token);
    _outcomeStoreTime.delete(token);

    const secret = envConfig.ltiSecret || process.env.AGNI_LTI_SECRET || '';
    if (!secret) {
      return sendResponse(500, { ok: false, error: 'LTI not configured' });
    }

    const err = await replaceResult(entry.outcomeServiceUrl, entry.sourcedId, entry.consumerKey, secret, score);
    if (err) {
      return sendResponse(502, { ok: false, error: err });
    }
    return sendResponse(200, { ok: true });
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
