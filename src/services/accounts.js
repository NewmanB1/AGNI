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
const CREATORS_PATH = path.join(DATA_DIR, 'creator_accounts.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'student_accounts.json');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');

const SCRYPT_KEYLEN = 64;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TRANSFER_TTL_MS = 48 * 60 * 60 * 1000; // 48h

// ── Helpers ──────────────────────────────────────────────────────────────────

const { loadJSONAsync: loadJson, saveJSONAsync: saveJson } = require('../utils/json-store');

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
  if (!password || password.length < 6) return { error: 'Password must be at least 6 characters' };

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
}

/**
 * Authenticate a creator with email + password.
 * Returns a session token on success.
 */
async function loginCreator({ email, password }) {
  if (!email || !password) return { error: 'Email and password are required' };
  const normalEmail = email.trim().toLowerCase();
  const data = await loadCreators();
  const creator = data.creators.find(c => c.email === normalEmail);
  if (!creator) return { error: 'Invalid email or password' };

  const hash = await hashPassword(password, creator.salt);
  if (hash !== creator.passwordHash) return { error: 'Invalid email or password' };

  const token = randomHex(TOKEN_BYTES);
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  purgeExpiredSessions(sessions);
  sessions.sessions.push({
    token,
    creatorId: creator.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  await saveJson(SESSIONS_PATH, sessions);

  return { ok: true, token, creator: sanitizeCreator(creator) };
}

/** Validate a session token and return the creator profile (or null). */
async function validateSession(token) {
  if (!token) return null;
  const sessions = await loadJson(SESSIONS_PATH, { sessions: [] });
  const now = Date.now();
  const tokenBuf = Buffer.from(String(token));
  const session = sessions.sessions.find(s => {
    if (new Date(s.expiresAt).getTime() <= now) return false;
    const sBuf = Buffer.from(String(s.token));
    if (tokenBuf.length !== sBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, sBuf);
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
  const tokenBuf = Buffer.from(String(token));
  sessions.sessions = sessions.sessions.filter(s => {
    const sBuf = Buffer.from(String(s.token));
    if (tokenBuf.length !== sBuf.length) return true;
    return !crypto.timingSafeEqual(tokenBuf, sBuf);
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
  const data = await loadCreators();
  const creator = data.creators.find(c => c.id === creatorId);
  if (!creator) return { error: 'Creator not found' };
  creator.approved = !!approved;
  await saveCreators(data);
  return { ok: true, creatorId, approved: creator.approved };
}

/** Record that a creator authored a lesson (called on save). */
async function recordLessonAuthored(creatorId, slug) {
  if (!creatorId) return;
  const data = await loadCreators();
  const creator = data.creators.find(c => c.id === creatorId);
  if (!creator) return;
  if (!creator.lessonsAuthored) creator.lessonsAuthored = [];
  if (!creator.lessonsAuthored.includes(slug)) {
    creator.lessonsAuthored.push(slug);
    await saveCreators(data);
  }
}

// ── Student accounts ─────────────────────────────────────────────────────────

async function loadStudents() {
  return loadJson(STUDENTS_PATH, { students: [] });
}
async function saveStudents(data) {
  await saveJson(STUDENTS_PATH, data);
}

function generatePseudoId() {
  const bytes = crypto.randomBytes(4);
  return 'px-' + bytes.toString('hex');
}

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
  const data = await loadStudents();
  const pseudoId = generatePseudoId();
  const { hash, salt } = await hashPin(pin);
  const student = buildStudentRecord({ pseudoId, displayName, pinHash: hash, pinSalt: salt, createdBy });
  data.students.push(student);
  await saveStudents(data);
  return { ok: true, student };
}

/**
 * Bulk-create student accounts (teacher creates a class roster).
 * @param {{ names: string[], pin?: string, createdBy?: string }} opts
 */
async function createStudentsBulk({ names, pin, createdBy } = {}) {
  if (!Array.isArray(names) || names.length === 0) {
    return { error: 'At least one name is required' };
  }
  const data = await loadStudents();
  const { hash, salt } = await hashPin(pin);
  const created = [];
  for (const name of names) {
    const pseudoId = generatePseudoId();
    const student = buildStudentRecord({ pseudoId, displayName: name, pinHash: hash, pinSalt: salt, createdBy });
    data.students.push(student);
    created.push(student);
  }
  await saveStudents(data);
  return { ok: true, students: created, count: created.length };
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
}

/**
 * Generate a one-time transfer token so a student can move to a new device.
 * The token encodes the pseudoId and can be entered on the new phone.
 */
async function generateTransferToken(pseudoId) {
  const { data, student } = await findStudentWithData(pseudoId);
  if (!student) return { error: 'Student not found' };

  const token = randomCode(8);
  student.transferToken = token;
  student.transferExpiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
  await saveStudents(data);
  return { ok: true, pseudoId, token, expiresAt: student.transferExpiresAt };
}

/**
 * Claim a transfer token from a new device.
 * Returns the pseudoId so the client can set it in localStorage.
 */
async function claimTransferToken(token) {
  if (!token || !token.trim()) return { error: 'Token is required' };
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
}

/**
 * Verify a student's PIN (for device-local auth on shared devices).
 * Supports three formats and migrates legacy ones to scrypt on success:
 *   1. scrypt (pinHash + pinSalt) — current
 *   2. SHA-256 (pinHash, no pinSalt) — legacy v1
 *   3. plaintext (pin field) — legacy v0
 */
async function verifyStudentPin(pseudoId, pin) {
  const { data, student } = await findStudentWithData(pseudoId);
  if (!student) return { error: 'Student not found' };

  if (!student.pinHash && !student.pin) return { ok: true, verified: true };

  let verified = false;
  let needsMigration = false;

  if (student.pinHash && student.pinSalt) {
    verified = await verifyPinHash(pin, student.pinHash, student.pinSalt);
  } else if (student.pinHash) {
    verified = hashPinLegacy(pin) === student.pinHash;
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
}

/**
 * Migrate all legacy plaintext PINs to scrypt hashes.
 * Call once at hub startup; idempotent.
 */
async function migrateLegacyPins() {
  const data = await loadStudents();
  let migrated = 0;
  for (const student of data.students) {
    if (student.pin && !student.pinHash) {
      const { hash, salt } = await hashPin(student.pin);
      student.pinHash = hash;
      student.pinSalt = salt;
      delete student.pin;
      migrated++;
    }
  }
  if (migrated > 0) {
    await saveStudents(data);
  }
  return { migrated };
}

module.exports = {
  registerCreator,
  loginCreator,
  validateSession,
  destroySession,
  cleanExpiredSessions,
  listCreators,
  setCreatorApproval,
  recordLessonAuthored,
  createStudent,
  createStudentsBulk,
  listStudents,
  getStudent,
  updateStudent,
  generateTransferToken,
  claimTransferToken,
  verifyStudentPin,
  migrateLegacyPins
};
