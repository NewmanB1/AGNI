'use strict';

const lmsService        = require('../../src/services/lms');
const governanceService = require('../../src/services/governance');
const authorService     = require('../../src/services/author');
const accountsService   = require('../../src/services/accounts');
const lessonChain       = require('../../src/services/lesson-chain');

module.exports = {
  lmsService, governanceService, authorService, accountsService, lessonChain
};
