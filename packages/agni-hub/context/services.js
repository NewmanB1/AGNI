'use strict';

const lmsService = require('@agni/services/lms');
const governanceService = require('@agni/services/governance');
const authorService = require('@agni/services/author');
const accountsService = require('@agni/services/accounts');
const lessonChain = require('@agni/services/lesson-chain');

module.exports = {
  lmsService, governanceService, authorService, accountsService, lessonChain
};
