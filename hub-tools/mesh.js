'use strict';

const path = require('path');

if (require.main === module) {
  const meshPath = path.join(__dirname, '../packages/agni-hub/mesh/index.js');
  const result = require('child_process').spawnSync(process.execPath, [meshPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status !== null ? result.status : 0);
} else {
  module.exports = require('@agni/hub').mesh;
}
