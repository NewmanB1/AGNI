'use strict';

const { readBody, handleJsonBody, createResponseSender, extractBearerToken, safeErrorMessage, checkAuthRateLimit, generateRequestId } = require('../../src/utils/http-helpers');
const { computeStreaks, collectReviewDates } = require('../../src/utils/streak');

function paginate(items, qs) {
  const total = items.length;
  const limit = Math.max(1, Math.min(1000, parseInt(qs.limit, 10) || total));
  const offset = Math.max(0, parseInt(qs.offset, 10) || 0);
  return { items: items.slice(offset, offset + limit), total, limit, offset };
}

module.exports = {
  readBody, handleJsonBody, createResponseSender, extractBearerToken,
  safeErrorMessage, checkAuthRateLimit, generateRequestId,
  computeStreaks, collectReviewDates,
  paginate
};
