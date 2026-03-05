'use strict';

const path = require('path');

if (require.main === module) {
  const realPath = path.join(__dirname, '../packages/agni-hub/theta.js');
  const result = require('child_process').spawnSync(process.execPath, [realPath, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(result.status !== null ? result.status : 0);
}

module.exports = require('@agni/hub').theta;