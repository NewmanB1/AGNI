'use strict';

function register(router, ctx) {
  const { fs, path, loadJSONAsync, saveJSONAsync, adminOnly, handleJsonBody,
          DATA_DIR, SERVE_DIR, PORT, APPROVED_CATALOG,
          MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT } = ctx;

  router.get('/api/admin/onboarding-status', (req, res, { sendResponse }) => {
    const isFirstRun = !fs.existsSync(path.join(DATA_DIR, 'hub-config.json')) &&
                       !fs.existsSync(path.resolve(path.join(__dirname, '../../data/hub-config.json')));
    return sendResponse(200, { isFirstRun });
  });

  router.get('/api/admin/config', adminOnly(async (req, res, { sendResponse }) => {
    const cfgPath = path.resolve(path.join(__dirname, '../../data/hub-config.json'));
    const cfg = await loadJSONAsync(cfgPath, {});
    const effective = {
      dataDir: DATA_DIR,
      serveDir: SERVE_DIR,
      thetaPort: PORT,
      approvedCatalog: APPROVED_CATALOG,
      minLocalSample: MIN_LOCAL_SAMPLE_SIZE,
      minLocalEdges: MIN_LOCAL_EDGE_COUNT,
      ...cfg
    };
    return sendResponse(200, effective);
  }));

  const ALLOWED_CONFIG_KEYS = new Set([
    'hubName', 'hubId', 'dataDir', 'serveDir', 'thetaPort', 'servePort', 'sentryPort',
    'corsOrigin', 'syncTransport', 'homeUrl', 'usbPath', 'maxStudents', 'maxLessons',
    'memoryBudgetMb', 'enableTelemetry', 'enableLms', 'locale'
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
      const cfgPath = path.resolve(path.join(__dirname, '../../data/hub-config.json'));
      await saveJSONAsync(cfgPath, cfg);
      return sendResponse(200, { ok: true, message: 'Config saved. Restart hub for changes to take effect.' });
    });
  }));

  router.post('/api/admin/sync-test', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (payload) => {
      const { transport, homeUrl, usbPath } = payload;
      const t = transport || 'starlink';
      if (t === 'usb') {
        const p = usbPath || '/mnt/usb/agni-sync';
        if (!fs.existsSync(p)) {
          try {
            fs.mkdirSync(p, { recursive: true });
            return sendResponse(200, { ok: true, message: 'USB path created and writable.' });
          } catch (e) {
            return sendResponse(200, { ok: false, message: 'USB path not accessible: ' + e.message });
          }
        }
        try {
          fs.writeFileSync(path.join(p, '.agni-test'), 'ok');
          fs.unlinkSync(path.join(p, '.agni-test'));
          return sendResponse(200, { ok: true, message: 'USB path writable.' });
        } catch (e) {
          return sendResponse(200, { ok: false, message: 'USB path not writable: ' + e.message });
        }
      }
      const url = (homeUrl || '').replace(/\/$/, '');
      if (!url) return sendResponse(200, { ok: false, message: 'Home URL required for Starlink test.' });
      const target = url + (url.endsWith('/api/hub-sync') ? '' : '/api/hub-sync');
      const parsed = new URL(target);
      const client = parsed.protocol === 'https:' ? require('https') : require('http');
      const reqOpt = { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname || '/api/hub-sync', method: 'OPTIONS', timeout: 5000 };
      const r = client.request(reqOpt, (resp) => {
        return sendResponse(200, { ok: resp.statusCode < 400, message: 'Home server responded: ' + resp.statusCode });
      });
      r.on('error', (e) => sendResponse(200, { ok: false, message: 'Connection failed: ' + e.message }));
      r.on('timeout', () => { r.destroy(); sendResponse(200, { ok: false, message: 'Connection timeout.' }); });
      r.end();
    });
  });
}

module.exports = { register };
