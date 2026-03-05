'use strict';

/**
 * Account management service for AGNI.
 * Creator and student accounts, sessions, transfer tokens.
 * Storage: flat JSON under DATA_DIR.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envConfig = require('@agni/utils/env-config');
const DATA_DIR = envConfig.dataDir;
const CREATORS_PATH = path.join(DATA_DIR, 'creator-accounts.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'student-accounts.json');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');

const SCRYPT_KEYLEN = 64;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSFER_TTL_MS = 48 * 60 * 60 * 1000;

const { loadJSONAsync: loadJson, saveJSONAsync: saveJson } = require('@agni/utils/json-store');
const { withLock } = require('@agni/utils/file-lock');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomId(prefix) {
  return prefix + '-' + randomHex(6);
}

function randomCode(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const max = Math.floor(256 / chars.length) * chars.length;
  let result = '';
  while (result.length < len) {
    const bytes = crypto.randomBytes(len - result.length + 4);
    for (let i = 0; i < bytes.length && result.length < len; i++) {
      if (bytes[i] < max) result += chars[bytes[i] % chars.length];
    }
  }
  return result;
}

function sanitizeCreator(creator) {
  const { passwordHash, salt, ...safe } = creator;
  return safe;
}

function buildStudentRecord(opts) {
  return {
    pseudoId: opts.pseudoId,
    displayName: (opts.displayName || '').trim() || null,
    pinHash: opts.pinHash,
    pinSalt: opts.pinSalt,
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy || null,
    transferToken: null,
    transferExpiresAt: null,
    active: true
  };
}

async function findStudentWithData(pseudoId) {
  const data = await loadStudents();
  const student = data.students.find(function(s) { return s.pseudoId === pseudoId; });
  return { data: data, student: student };
}

function purgeExpiredSessions(sessions) {
  const now = Date.now();
  sessions.sessions = sessions.sessions.filter(function(s) { return new Date(s.expiresAt).getTime() > now; });
}

async function loadCreators() {
  return loadJson(CREATORS_PATH, { creators: [] });
}

async function saveCreators(data) {
  await saveJson(CREATORS_PATH, data);
}

async function registerCreator(opts) {
  const name = opts.name;
  const email = opts.email;
  const password = opts.password;
  if (!name || !name.trim()) return { error: 'Name is required' };
  if (!email || !email.trim()) return { error: 'Email is required' };
  if (!/\S+@\S+\.\S+/.test(email.trim())) return { error: 'Invalid email format' };
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' };

  return withLock(CREATORS_PATH, async function() {
    const normalEmail = email.trim().toLowerCase();
    const data = await loadCreators();
    if (data.creators.some(function(c) { return c.email === normalEmail; })) {
      return { error: 'An account with this email already exists' };
    }
    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);
    const creator = {
      id: randomId('cr'),
      name: name.trim(),
      email: normalEmail,
      passwordHash: passwordHash,
      salt: salt,
      role: 'creator',
      approved: false,
      createdAt: new Date().toISOString(),
      lessonsAuthored: []
    };
    data.creators.push(creator);
    await saveCreators(data);
    return { ok: true, creator: sanitizeCreator(creator) };
  });
}

const _loginAttempts = {};
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_MAX_KEYS = 10000;
let _lastSweep = Date.now();

function checkRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  if (now - _lastSweep > LOGIN_WINDOW_MS) {
    const keys = Object.keys(_loginAttempts);
    for (let i = 0; i < keys.length; i++) {
      _loginAttempts[keys[i]] = _loginAttempts[keys[i]].filter(function(ts) { return now - ts < LOGIN_WINDOW_MS; });
      if (_loginAttempts[keys[i]].length === 0) delete _loginAttempts[keys[i]];
    }
    _lastSweep = now;
  }
  if (!_loginAttempts[key] && Object.keys(_loginAttempts).length >= LOGIN_MAX_KEYS) return false;
  if (!_loginAttempts[key]) _loginAttempts[key] = [];
  _loginAttempts[key] = _loginAttempts[key].filter(function(ts) { return now - ts < LOGIN_WINDOW_MS; });
  if (_loginAttempts[key].length >= LOGIN_MAX_ATTEMPTS) return false;
  _loginAttempts[key].push(now);
  return true;
}

async function loginCreator(opts) {
  const email = opts.email;
  const password = opts.password;
  if (!email || !password) return { error: 'Email and password are required' };
  if (!checkRateLimit(email)) return { error: 'Too many login attempts. Try again later.' };
  const normalEmail = email.trim().toLowerCase();
  const data = await loadCreators();
  const creator = data.creators.find(function(c) { return c.email === normalEmail; });
  if (!creator) return { error: 'Invalid email or password' };
  const hash = await hashPassword(password, creator.salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(creator.passwordHash, 'hex');
  if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
    return { error: 'Invalid email or password' };
  }
  const token = randomHex(TOKEN_BYTES);
  await withLock(SESSIONS_PATH, async function() {
    const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
    purgeExpiredSessions(sessions);
    sessions.sessions.push({
      tokenHash: hashToken(token),
      creatorId: creator.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    await saveJson(SESSIONS_PATH, sessions);
  });
  return { ok: true, token: token, creator: sanitizeCreator(creator) };
}

async function validateSession(token) {
  if (!token) return null;
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  const now = Date.now();
  const incoming = hashToken(token);
  const session = sessions.sessions.find(function(s) {
    if (new Date(s.expiresAt).getTime() <= now) return false;
    const stored = s.tokenHash || s.token;
    if (incoming.length !== stored.length) return false;
    return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(stored));
  });
  if (!session) return null;
  const data = await loadCreators();
  const creator = data.creators.find(function(c) { return c.id === session.creatorId; });
  if (!creator) return null;
  return sanitizeCreator(creator);
}

async function cleanExpiredSessions() {
  return withLock(SESSIONS_PATH, async function() {
    const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
    const before = sessions.sessions.length;
    purgeExpiredSessions(sessions);
    if (sessions.sessions.length < before) await saveJson(SESSIONS_PATH, sessions);
    return { removed: before - sessions.sessions.length };
  });
}

async function destroySession(token) {
  if (!token) return;
  await withLock(SESSIONS_PATH, async function() {
    const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
    const incoming = hashToken(token);
    sessions.sessions = sessions.sessions.filter(function(s) {
      const stored = s.tokenHash || s.token;
      if (incoming.length !== stored.length) return true;
      return !crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(stored));
    });
    await saveJson(SESSIONS_PATH, sessions);
  });
}

async function listCreators() {
  const data = await loadCreators();
  return data.creators.map(sanitizeCreator);
}

async function setCreatorApproval(creatorId, approved) {
  return withLock(CREATORS_PATH, async function() {
    const data = await loadCreators();
    const creator = data.creators.find(function(c) { return c.id === creatorId; });
    if (!creator) return { error: 'Creator not found' };
    creator.approved = !!approved;
    await saveCreators(data);
    return { ok: true, creatorId: creatorId, approved: creator.approved };
  });
}

async function setCreatorRole(creatorId, role) {
  return withLock(CREATORS_PATH, async function() {
    const data = await loadCreators();
    const creator = data.creators.find(function(c) { return c.id === creatorId; });
    if (!creator) return { error: 'Creator not found' };
    creator.role = role;
    await saveCreators(data);
    return { ok: true, creatorId: creatorId, role: creator.role };
  });
}

async function recordLessonAuthored(creatorId, slug) {
  if (!creatorId) return;
  return withLock(CREATORS_PATH, async function() {
    const data = await loadCreators();
    const creator = data.creators.find(function(c) { return c.id === creatorId; });
    if (!creator) return;
    if (!creator.lessonsAuthored) creator.lessonsAuthored = [];
    if (creator.lessonsAuthored.indexOf(slug) === -1) {
      creator.lessonsAuthored.push(slug);
      await saveCreators(data);
    }
  });
}

async function loadStudents() {
  return loadJson(STUDENTS_PATH, { students: [] });
}

async function saveStudents(data) {
  await saveJson(STUDENTS_PATH, data);
}

function generatePseudoId() {
  return 'px-' + crypto.randomBytes(16).toString('hex');
}

function hashPinLegacy(pin) {
  if (!pin) return null;
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

async function hashPin(pin) {
  if (!pin) return { hash: null, salt: null };
  const salt = randomHex(16);
  const hash = await hashPassword(String(pin), salt);
  return { hash: hash, salt: salt };
}

async function verifyPinHash(pin, hash, salt) {
  const computed = await hashPassword(String(pin), salt);
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

function sanitizeStudent(student) {
  return {
    pseudoId: student.pseudoId,
    displayName: student.displayName,
    hasPin: !!(student.pinHash || student.pin),
    createdAt: student.createdAt,
    createdBy: student.createdBy,
    active: student.active
  };
}

async function createStudent(opts) {
  opts = opts || {};
  return withLock(STUDENTS_PATH, async function() {
    const data = await loadStudents();
    const pseudoId = generatePseudoId();
    const ph = await hashPin(opts.pin);
    const student = buildStudentRecord({
      pseudoId: pseudoId,
      displayName: opts.displayName,
      pinHash: ph.hash,
      pinSalt: ph.salt,
      createdBy: opts.createdBy
    });
    data.students.push(student);
    await saveStudents(data);
    return { ok: true, student: sanitizeStudent(student) };
  });
}

async function createStudentsBulk(opts) {
  opts = opts || {};
  if (!Array.isArray(opts.names) || opts.names.length === 0) return { error: 'At least one name is required' };
  return withLock(STUDENTS_PATH, async function() {
    const data = await loadStudents();
    const created = [];
    for (let i = 0; i < opts.names.length; i++) {
      const pseudoId = generatePseudoId();
      const ph = await hashPin(opts.pin);
      const student = buildStudentRecord({
        pseudoId: pseudoId,
        displayName: opts.names[i],
        pinHash: ph.hash,
        pinSalt: ph.salt,
        createdBy: opts.createdBy
      });
      data.students.push(student);
      created.push(student);
    }
    await saveStudents(data);
    return { ok: true, students: created.map(sanitizeStudent), count: created.length };
  });
}

async function listStudents() {
  const data = await loadStudents();
  return data.students.map(sanitizeStudent);
}

async function getStudent(pseudoId) {
  const r = await findStudentWithData(pseudoId);
  return r.student ? sanitizeStudent(r.student) : null;
}

async function updateStudent(pseudoId, updates) {
  return withLock(STUDENTS_PATH, async function() {
    const r = await findStudentWithData(pseudoId);
    if (!r.student) return { error: 'Student not found' };
    const student = r.student;
    if (updates.displayName !== undefined) student.displayName = updates.displayName;
    if (updates.pin !== undefined) {
      const ph = await hashPin(updates.pin);
      student.pinHash = ph.hash;
      student.pinSalt = ph.salt;
      delete student.pin;
    }
    if (updates.active !== undefined) student.active = !!updates.active;
    await saveStudents(r.data);
    return { ok: true, student: sanitizeStudent(student) };
  });
}

async function generateTransferToken(pseudoId) {
  return withLock(STUDENTS_PATH, async function() {
    const r = await findStudentWithData(pseudoId);
    if (!r.student) return { error: 'Student not found' };
    const token = randomCode(8);
    r.student.transferTokenHash = hashToken(token);
    r.student.transferToken = null;
    r.student.transferExpiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
    await saveStudents(r.data);
    return { ok: true, pseudoId: pseudoId, token: token, expiresAt: r.student.transferExpiresAt };
  });
}

async function claimTransferToken(token) {
  if (!token || !token.trim()) return { error: 'Token is required' };
  return withLock(STUDENTS_PATH, async function() {
    const code = token.trim().toUpperCase();
    const codeHash = hashToken(code);
    const data = await loadStudents();
    const student = data.students.find(function(s) {
      const stored = s.transferTokenHash || s.transferToken;
      if (!stored) return false;
      if (!s.transferExpiresAt || new Date(s.transferExpiresAt).getTime() <= Date.now()) return false;
      if (stored.length !== codeHash.length) return false;
      return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(stored));
    });
    if (!student) return { error: 'Invalid or expired transfer token' };
    student.transferToken = null;
    student.transferTokenHash = null;
    student.transferExpiresAt = null;
    await saveStudents(data);
    return { ok: true, pseudoId: student.pseudoId, displayName: student.displayName };
  });
}

async function verifyStudentPin(pseudoId, pin) {
  return withLock(STUDENTS_PATH, async function() {
    const r = await findStudentWithData(pseudoId);
    if (!r.student) return { error: 'Student not found' };
    const student = r.student;
    if (!student.pinHash && !student.pin) return { ok: true, verified: true };
    let verified = false;
    let needsMigration = false;
    if (student.pinHash && student.pinSalt) {
      verified = await verifyPinHash(pin, student.pinHash, student.pinSalt);
    } else if (student.pinHash) {
      const computed = hashPinLegacy(pin);
      if (computed && student.pinHash && computed.length === student.pinHash.length) {
        verified = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(student.pinHash, 'hex'));
      }
      needsMigration = verified;
    }
    if (!verified) return { ok: false, verified: false };
    if (needsMigration) {
      const ph = await hashPin(pin);
      student.pinHash = ph.hash;
      student.pinSalt = ph.salt;
      delete student.pin;
      await saveStudents(r.data);
    }
    return { ok: true, verified: true };
  });
}

async function migrateLegacyPins() {
  const data = await loadStudents();
  let migrated = 0;
  let legacySha256 = 0;
  for (let i = 0; i < data.students.length; i++) {
    const student = data.students[i];
    if (student.pin && !student.pinHash) {
      const ph = await hashPin(student.pin);
      student.pinHash = ph.hash;
      student.pinSalt = ph.salt;
      delete student.pin;
      migrated++;
    } else if (student.pinHash && !student.pinSalt) {
      legacySha256++;
    }
  }
  if (migrated > 0) await saveStudents(data);
  return { migrated: migrated, legacySha256: legacySha256 };
}

module.exports = {
  registerCreator,
  loginCreator,
  validateSession,
  destroySession,
  cleanExpiredSessions,
  listCreators,
  setCreatorApproval,
  setCreatorRole,
  recordLessonAuthored,
  createStudent,
  createStudentsBulk,
  listStudents,
  getStudent,
  updateStudent,
  generateTransferToken,
  claimTransferToken,
  verifyStudentPin,
  migrateLegacyPins,
  generateCode: randomCode
};
