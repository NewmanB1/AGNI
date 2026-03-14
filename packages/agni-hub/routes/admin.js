'use strict';

function register(router, ctx) {
  const { fs, path, loadJSONAsync, saveJSONAsync, adminOnly, handleJsonBody,
          DATA_DIR, SERVE_DIR, PORT, APPROVED_CATALOG,
          MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT } = ctx;

  router.get('/api/admin/onboarding-status', (req, res, { sendResponse }) => {
    const isFirstRun = !fs.existsSync(path.join(DATA_DIR, 'hub-config.json')) &&
                       !fs.existsSync(path.resolve(path.join(__dirname, '../../../data/hub-config.json')));
    return sendResponse(200, { isFirstRun });
  });

  router.get('/api/admin/config', adminOnly(async (req, res, { sendResponse }) => {
    const cfgPath = path.resolve(path.join(__dirname, '../../../data/hub-config.json'));
    const cfg = await loadJSONAsync(cfgPath, {});
    const effective = {
      dataDir: DATA_DIR,
      serveDir: SERVE_DIR,
      pathfinderPort: PORT,
      approvedCatalog: APPROVED_CATALOG,
      minLocalSample: MIN_LOCAL_SAMPLE_SIZE,
      minLocalEdges: MIN_LOCAL_EDGE_COUNT,
      ...cfg
    };
    return sendResponse(200, effective);
  }));

  const ALLOWED_CONFIG_KEYS = new Set([
    'hubName', 'hubId', 'dataDir', 'serveDir', 'pathfinderPort', 'servePort', 'telemetryEnginePort',
    'corsOrigin', 'syncTransport', 'homeUrl', 'usbPath', 'maxStudents', 'maxLessons',
    'memoryBudgetMb', 'enableTelemetry', 'enableLms', 'locale', 'studentSessionTtlMs'
  ]);

  router.put('/api/admin/config', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (cfg) => {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        return sendResponse(400, { error: 'Config must be a JSON object' });
      }
      const unknown = Object.keys(cfg).filter(k => !ALLOWED_CONFIG_KEYS.has(k));
      if (unknown.length > 0) {
        return sendResponse(400, { error: 'Unknown config keys: ' + unknown.join(', ') });
      }
      if (Object.prototype.hasOwnProperty.call(cfg, '__proto__') ||
          Object.prototype.hasOwnProperty.call(cfg, 'constructor') ||
          Object.prototype.hasOwnProperty.call(cfg, 'prototype')) {
        return sendResponse(400, { error: 'Payload contains forbidden keys' });
      }
      if (cfg.usbPath != null && cfg.usbPath !== '') {
        const ec = require('@agni/utils/env-config');
        try { ec.validUsbPath(cfg.usbPath, 'usbPath'); } catch (e) {
          return sendResponse(400, { error: e.message });
        }
      }
      const cfgPath = path.resolve(path.join(__dirname, '../../../data/hub-config.json'));
      const existing = await loadJSONAsync(cfgPath, {});
      const merged = Object.create(null);
      for (const k of Object.keys(existing)) {
        if (ALLOWED_CONFIG_KEYS.has(k)) merged[k] = existing[k];
      }
      for (const k of Object.keys(cfg)) {
        if (ALLOWED_CONFIG_KEYS.has(k)) merged[k] = cfg[k];
      }
      await saveJSONAsync(cfgPath, merged);
      return sendResponse(200, { ok: true, message: 'Config saved. Restart hub for changes to take effect.' });
    });
  }));

  const envConfig = require('@agni/utils/env-config');
  const USB_SAFE_ROOT = path.resolve(envConfig.USB_SAFE_ROOT || '/mnt/usb');

  const PRIVATE_IP_RANGES = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^::1$/,
    /^::$/,
    /^0+:0+:0+:0+:0+:0*:0*:0*1?$/,
    /^fc00:/i, /^fd/i, /^fe80:/i,
    /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i,
  ];

  function isPrivateHost(hostname) {
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return true;
    }
    const stripped = hostname.replace(/^\[/, '').replace(/\]$/, '');
    return PRIVATE_IP_RANGES.some(function (re) { return re.test(stripped); });
  }

  router.post('/api/admin/sync-test', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (payload) => {
      const { transport, homeUrl, usbPath } = payload;
      const t = transport || 'starlink';
      if (t === 'usb') {
        const p = usbPath || path.join(USB_SAFE_ROOT, 'agni-sync');
        try {
          envConfig.validUsbPath(p, 'USB path');
        } catch (err) {
          return sendResponse(400, { ok: false, message: err.message });
        }
        if (!fs.existsSync(p)) {
          try {
            fs.mkdirSync(p, { recursive: true });
            return sendResponse(200, { ok: true, message: 'USB path created and writable.' });
          } catch {
            return sendResponse(200, { ok: false, message: 'USB path not accessible.' });
          }
        }
        try {
          fs.writeFileSync(path.join(p, '.agni-test'), 'ok');
          fs.unlinkSync(path.join(p, '.agni-test'));
          return sendResponse(200, { ok: true, message: 'USB path writable.' });
        } catch {
          return sendResponse(200, { ok: false, message: 'USB path not writable.' });
        }
      }
      const url = (homeUrl || '').replace(/\/$/, '');
      if (!url) return sendResponse(200, { ok: false, message: 'Home URL required for Starlink test.' });
      let parsed;
      try { parsed = new URL(url); } catch {
        return sendResponse(400, { ok: false, message: 'Invalid URL.' });
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return sendResponse(400, { ok: false, message: 'Only http/https URLs are allowed.' });
      }
      if (isPrivateHost(parsed.hostname)) {
        return sendResponse(400, { ok: false, message: 'Cannot connect to private/loopback addresses.' });
      }
      const target = url + (url.endsWith('/api/hub-sync') ? '' : '/api/hub-sync');
      parsed = new URL(target);
      const client = parsed.protocol === 'https:' ? require('https') : require('http');
      const reqOpt = { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname || '/api/hub-sync', method: 'OPTIONS', timeout: 5000 };
      const r = client.request(reqOpt, (resp) => {
        return sendResponse(200, { ok: resp.statusCode < 400, message: 'Home server responded: ' + resp.statusCode });
      });
      r.on('error', () => sendResponse(200, { ok: false, message: 'Connection failed.' }));
      r.on('timeout', () => { r.destroy(); sendResponse(200, { ok: false, message: 'Connection timeout.' }); });
      r.end();
    });
  }));
}

module.exports = { register };
