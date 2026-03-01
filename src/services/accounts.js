'use strict';

/**
 * Account management service for AGNI.
 *
 * Two account tiers:
 *   1. Creator accounts — require name + email + password.
 *      Provide accountability for lesson content (combating abuse).
 *   2. Student accounts — device-bound pseudoIds with optional PIN.
 *      Easy creation (teacher can bulk-create), transferable between devices
 *      via one-time transfer tokens.
 *
 * Storage: flat JSON files under DATA_DIR (offline-first, no external DB).
 * Password hashing: Node built-in crypto.scrypt (no extra deps).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envConfig = require('../utils/env-config');
const DATA_DIR = envConfig.dataDir;
const CREATORS_PATH = path.join(DATA_DIR, 'creator-accounts.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'student-accounts.json');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');

const SCRYPT_KEYLEN = 64;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TRANSFER_TTL_MS = 48 * 60 * 60 * 1000; // 48h

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const { loadJSONAsync: loadJson, saveJSONAsync: saveJson } = require('../utils/json-store');
const { withLock } = require('../utils/file-lock');

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
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

function buildStudentRecord({ pseudoId, displayName, pinHash, pinSalt, createdBy }) {
  return {
    pseudoId,
    displayName: (displayName || '').trim() || null,
    pinHash,
    pinSalt,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
    transferToken: null,
    transferExpiresAt: null,
    active: true
  };
}

async function findStudentWithData(pseudoId) {
  const data = await loadStudents();
  const student = data.students.find(s => s.pseudoId === pseudoId);
  return { data, student };
}

function purgeExpiredSessions(sessions) {
  const now = Date.now();
  sessions.sessions = sessions.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
}

// ── Creator accounts ─────────────────────────────────────────────────────────

async function loadCreators() {
  return loadJson(CREATORS_PATH, { creators: [] });
}
async function saveCreators(data) {
  await saveJson(CREATORS_PATH, data);
}

/**
 * Register a new lesson creator.
 * @param {{ name: string, email: string, password: string }} info
 * @returns {Promise<{ ok: true, creator: object } | { error: string }>}
 */
async function registerCreator({ name, email, password }) {
  if (!name || !name.trim()) return { error: 'Name is required' };
  if (!email || !email.trim()) return { error: 'Email is required' };
  if (!/\S+@\S+\.\S+/.test(email.trim())) return { error: 'Invalid email format' };
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' };

  return withLock(CREATORS_PATH, async () => {
    const normalEmail = email.trim().toLowerCase();
    const data = await loadCreators();
    if (data.creators.some(c => c.email === normalEmail)) {
      return { error: 'An account with this email already exists' };
    }

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);
    const creator = {
      id: randomId('cr'),
      name: name.trim(),
      email: normalEmail,
      passwordHash,
      salt,
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

// Sliding-window rate limiter: 5 attempts per 60s per email [R10 P2.3: bounded]
const _loginAttempts = {};
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_MAX_KEYS = 10000;
let _lastSweep = Date.now();

function checkRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();

  // Periodic sweep: evict stale entries every 60s to bound memory growth
  if (now - _lastSweep > LOGIN_WINDOW_MS) {
    const keys = Object.keys(_loginAttempts);
    for (let i = 0; i < keys.length; i++) {
      _loginAttempts[keys[i]] = _loginAttempts[keys[i]].filter(ts => now - ts < LOGIN_WINDOW_MS);
      if (_loginAttempts[keys[i]].length === 0) delete _loginAttempts[keys[i]];
    }
    _lastSweep = now;
  }

  // Hard cap on tracked keys to prevent memory exhaustion
  if (!_loginAttempts[key] && Object.keys(_loginAttempts).length >= LOGIN_MAX_KEYS) {
    return false;
  }

  if (!_loginAttempts[key]) _loginAttempts[key] = [];
  _loginAttempts[key] = _loginAttempts[key].filter(ts => now - ts < LOGIN_WINDOW_MS);
  if (_loginAttempts[key].length >= LOGIN_MAX_ATTEMPTS) return false;
  _loginAttempts[key].push(now);
  return true;
}

/**
 * Authenticate a creator with email + password.
 * Returns a session token on success.
 */
async function loginCreator({ email, password }) {
  if (!email || !password) return { error: 'Email and password are required' };
  if (!checkRateLimit(email)) return { error: 'Too many login attempts. Try again later.' };
  const normalEmail = email.trim().toLowerCase();
  const data = await loadCreators();
  const creator = data.creators.find(c => c.email === normalEmail);
  if (!creator) return { error: 'Invalid email or password' };

  const hash = await hashPassword(password, creator.salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(creator.passwordHash, 'hex');
  if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
    return { error: 'Invalid email or password' };
  }

  const token = randomHex(TOKEN_BYTES);
  await withLock(SESSIONS_PATH, async () => {
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

  return { ok: true, token, creator: sanitizeCreator(creator) };
}

/** Validate a session token and return the creator profile (or null). */
async function validateSession(token) {
  if (!token) return null;
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  const now = Date.now();
  const incoming = hashToken(token);
  const session = sessions.sessions.find(s => {
    if (new Date(s.expiresAt).getTime() <= now) return false;
    const stored = s.tokenHash || s.token;
    if (incoming.length !== stored.length) return false;
    return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(stored));
  });
  if (!session) return null;

  const data = await loadCreators();
  const creator = data.creators.find(c => c.id === session.creatorId);
  if (!creator) return null;
  return sanitizeCreator(creator);
}

/** Clean up expired sessions. Call periodically from hub startup. */
async function cleanExpiredSessions() {
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  const before = sessions.sessions.length;
  purgeExpiredSessions(sessions);
  if (sessions.sessions.length < before) {
    await saveJson(SESSIONS_PATH, sessions);
  }
  return { removed: before - sessions.sessions.length };
}

/** Destroy a session (logout). */
async function destroySession(token) {
  if (!token) return;
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  const incoming = hashToken(token);
  sessions.sessions = sessions.sessions.filter(s => {
    const stored = s.tokenHash || s.token;
    if (incoming.length !== stored.length) return true;
    return !crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(stored));
  });
  await saveJson(SESSIONS_PATH, sessions);
}

/** Admin: list all creator accounts (without password hashes). */
async function listCreators() {
  const data = await loadCreators();
  return data.creators.map(sanitizeCreator);
}

/** Admin: approve or revoke a creator account. */
async function setCreatorApproval(creatorId, approved) {
  return withLock(CREATORS_PATH, async () => {
    const data = await loadCreators();
    const creator = data.creators.find(c => c.id === creatorId);
    if (!creator) return { error: 'Creator not found' };
    creator.approved = !!approved;
    await saveCreators(data);
    return { ok: true, creatorId, approved: creator.approved };
  });
}

/** Admin: set a creator's role. */
async function setCreatorRole(creatorId, role) {
  return withLock(CREATORS_PATH, async () => {
    const data = await loadCreators();
    const creator = data.creators.find(c => c.id === creatorId);
    if (!creator) return { error: 'Creator not found' };
    creator.role = role;
    await saveCreators(data);
    return { ok: true, creatorId, role: creator.role };
  });
}

/** Record that a creator authored a lesson (called on save). */
async function recordLessonAuthored(creatorId, slug) {
  if (!creatorId) return;
  return withLock(CREATORS_PATH, async () => {
    const data = await loadCreators();
    const creator = data.creators.find(c => c.id === creatorId);
    if (!creator) return;
    if (!creator.lessonsAuthored) creator.lessonsAuthored = [];
    if (!creator.lessonsAuthored.includes(slug)) {
      creator.lessonsAuthored.push(slug);
      await saveCreators(data);
    }
  });
}

// ── Student accounts ─────────────────────────────────────────────────────────

async function loadStudents() {
  return loadJson(STUDENTS_PATH, { students: [] });
}
async function saveStudents(data) {
  await saveJson(STUDENTS_PATH, data);
}

function generatePseudoId() {
  const bytes = crypto.randomBytes(8);
  return 'px-' + bytes.toString('hex');
}

/**
 * @deprecated Legacy unsalted SHA-256 PIN hash — exists only for migration
 * from v0 student records. Never use for new hashes; use hashPin() instead.
 */
function hashPinLegacy(pin) {
  if (!pin) return null;
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

async function hashPin(pin) {
  if (!pin) return { hash: null, salt: null };
  const salt = randomHex(16);
  const hash = await hashPassword(String(pin), salt);
  return { hash, salt };
}

async function verifyPinHash(pin, hash, salt) {
  const computed = await hashPassword(String(pin), salt);
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

/**
 * Create a student account (teacher creates on behalf of student).
 * No email or ID required — just an optional display name and PIN.
 */
async function createStudent({ displayName, pin, createdBy } = {}) {
  return withLock(STUDENTS_PATH, async () => {
    const data = await loadStudents();
    const pseudoId = generatePseudoId();
    const { hash, salt } = await hashPin(pin);
    const student = buildStudentRecord({ pseudoId, displayName, pinHash: hash, pinSalt: salt, createdBy });
    data.students.push(student);
    await saveStudents(data);
    return { ok: true, student };
  });
}

/**
 * Bulk-create student accounts (teacher creates a class roster).
 * @param {{ names: string[], pin?: string, createdBy?: string }} opts
 */
async function createStudentsBulk({ names, pin, createdBy } = {}) {
  if (!Array.isArray(names) || names.length === 0) {
    return { error: 'At least one name is required' };
  }
  return withLock(STUDENTS_PATH, async () => {
    const data = await loadStudents();
    const created = [];
    for (const name of names) {
      const pseudoId = generatePseudoId();
      const { hash, salt } = await hashPin(pin);
      const student = buildStudentRecord({ pseudoId, displayName: name, pinHash: hash, pinSalt: salt, createdBy });
      data.students.push(student);
      created.push(student);
    }
    await saveStudents(data);
    return { ok: true, students: created, count: created.length };
  });
}

/** List all student accounts. */
async function listStudents() {
  const data = await loadStudents();
  return data.students;
}

/** Get a single student by pseudoId. */
async function getStudent(pseudoId) {
  const { student } = await findStudentWithData(pseudoId);
  return student || null;
}

/** Update a student's display name or PIN. */
async function updateStudent(pseudoId, updates) {
  return withLock(STUDENTS_PATH, async () => {
    const { data, student } = await findStudentWithData(pseudoId);
    if (!student) return { error: 'Student not found' };
    if (updates.displayName !== undefined) student.displayName = updates.displayName;
    if (updates.pin !== undefined) {
      const { hash, salt } = await hashPin(updates.pin);
      student.pinHash = hash;
      student.pinSalt = salt;
      delete student.pin;
    }
    if (updates.active !== undefined) student.active = !!updates.active;
    await saveStudents(data);
    return { ok: true, student };
  });
}

/**
 * Generate a one-time transfer token so a student can move to a new device.
 * The token encodes the pseudoId and can be entered on the new phone.
 */
async function generateTransferToken(pseudoId) {
  return withLock(STUDENTS_PATH, async () => {
    const { data, student } = await findStudentWithData(pseudoId);
    if (!student) return { error: 'Student not found' };

    const token = randomCode(8);
    student.transferToken = token;
    student.transferExpiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
    await saveStudents(data);
    return { ok: true, pseudoId, token, expiresAt: student.transferExpiresAt };
  });
}

/**
 * Claim a transfer token from a new device.
 * Returns the pseudoId so the client can set it in localStorage.
 */
async function claimTransferToken(token) {
  if (!token || !token.trim()) return { error: 'Token is required' };
  return withLock(STUDENTS_PATH, async () => {
    const code = token.trim().toUpperCase();
    const data = await loadStudents();
    const student = data.students.find(s =>
      s.transferToken === code &&
      s.transferExpiresAt &&
      new Date(s.transferExpiresAt).getTime() > Date.now()
    );
    if (!student) return { error: 'Invalid or expired transfer token' };

    student.transferToken = null;
    student.transferExpiresAt = null;
    await saveStudents(data);
    return { ok: true, pseudoId: student.pseudoId, displayName: student.displayName };
  });
}

/**
 * Verify a student's PIN (for device-local auth on shared devices).
 * Supports three formats and migrates legacy ones to scrypt on success:
 *   1. scrypt (pinHash + pinSalt) — current
 *   2. SHA-256 (pinHash, no pinSalt) — legacy v1
 *   3. plaintext (pin field) — legacy v0
 */
async function verifyStudentPin(pseudoId, pin) {
  return withLock(STUDENTS_PATH, async () => {
    const { data, student } = await findStudentWithData(pseudoId);
    if (!student) return { error: 'Student not found' };

    if (!student.pinHash && !student.pin) return { ok: true, verified: true };

    let verified = false;
    let needsMigration = false;

    if (student.pinHash && student.pinSalt) {
      verified = await verifyPinHash(pin, student.pinHash, student.pinSalt);
    } else if (student.pinHash) {
      // Timing-safe comparison for legacy SHA-256 hashes [R10 P2.2]
      const computed = hashPinLegacy(pin);
      if (computed && student.pinHash && computed.length === student.pinHash.length) {
        verified = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(student.pinHash, 'hex'));
      }
      needsMigration = verified;
    }

    if (!verified) return { ok: false, verified: false };

    if (needsMigration) {
      const { hash, salt } = await hashPin(pin);
      student.pinHash = hash;
      student.pinSalt = salt;
      delete student.pin;
      await saveStudents(data);
    }

    return { ok: true, verified: true };
  });
}

/**
 * Migrate all legacy PINs to scrypt hashes. Call once at hub startup; idempotent.
 *
 * Handles two legacy formats:
 *   - plaintext `pin` field (v0): re-hashed with scrypt immediately
 *   - unsalted SHA-256 `pinHash` without `pinSalt` (v1): cannot be proactively
 *     migrated (hash is irreversible). These are migrated on next PIN verification.
 *     Count is reported so operators have visibility.
 */
async function migrateLegacyPins() {
  const data = await loadStudents();
  let migrated = 0;
  let legacySha256 = 0;
  for (const student of data.students) {
    if (student.pin && !student.pinHash) {
      const { hash, salt } = await hashPin(student.pin);
      student.pinHash = hash;
      student.pinSalt = salt;
      delete student.pin;
      migrated++;
    } else if (student.pinHash && !student.pinSalt) {
      legacySha256++;
    }
  }
  if (migrated > 0) {
    await saveStudents(data);
  }
  return { migrated, legacySha256 };
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
