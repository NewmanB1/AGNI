'use strict';

const path = require('path');

if (require.main === module) {
  const realPath = path.join(__dirname, '../packages/agni-hub/pathfinder.js');
  const env = Object.assign({}, process.env);
  const existing = (env.NODE_OPTIONS || '').trim();
  const maxOldSpace = '--max-old-space-size=512';
  if (existing.indexOf('max-old-space-size') === -1) {
    env.NODE_OPTIONS = existing ? existing + ' ' + maxOldSpace : maxOldSpace;
  }
  const result = require('child_process').spawnSync(process.execPath, [realPath, ...process.argv.slice(2)], { stdio: 'inherit', env: env });
  process.exit(result.status !== null ? result.status : 0);
}

module.exports = require('@agni/hub').pathfinder;