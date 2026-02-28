'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { tempDir } = require('../helpers/fixtures');

const tmp = tempDir('accounts');
process.env.AGNI_DATA_DIR = tmp.dir;

const accounts = require('../../src/services/accounts');

after(() => {
  tmp.cleanup();
  delete process.env.AGNI_DATA_DIR;
});

// ── Creator registration ─────────────────────────────────────────────────────

describe('registerCreator', () => {
  it('registers a new creator', async () => {
    const r = await accounts.registerCreator({ name: 'Alice', email: 'alice@example.com', password: 'secret123' });
    assert.ok(r.ok);
    assert.ok(r.creator.id.startsWith('cr-'));
    assert.equal(r.creator.name, 'Alice');
    assert.equal(r.creator.email, 'alice@example.com');
    assert.equal(r.creator.approved, false);
    assert.ok(!r.creator.passwordHash, 'password hash must not be exposed');
    assert.ok(!r.creator.salt, 'salt must not be exposed');
  });

  it('rejects duplicate email', async () => {
    const r = await accounts.registerCreator({ name: 'Alice2', email: 'alice@example.com', password: 'other456' });
    assert.ok(r.error);
    assert.ok(r.error.includes('already exists'));
  });

  it('normalizes email to lowercase', async () => {
    const r = await accounts.registerCreator({ name: 'Bob', email: 'BOB@Example.COM', password: 'bobpass1' });
    assert.ok(r.ok);
    assert.equal(r.creator.email, 'bob@example.com');
  });

  it('rejects empty name', async () => {
    const r = await accounts.registerCreator({ name: '', email: 'x@x.com', password: 'abc123' });
    assert.ok(r.error);
  });

  it('rejects short password', async () => {
    const r = await accounts.registerCreator({ name: 'X', email: 'y@y.com', password: '123' });
    assert.ok(r.error);
    assert.ok(r.error.includes('6 characters'));
  });
});

// ── Creator login ────────────────────────────────────────────────────────────

describe('loginCreator', () => {
  it('authenticates with correct credentials', async () => {
    const r = await accounts.loginCreator({ email: 'alice@example.com', password: 'secret123' });
    assert.ok(r.ok);
    assert.ok(r.token);
    assert.ok(r.token.length >= 32);
    assert.equal(r.creator.email, 'alice@example.com');
    assert.ok(!r.creator.passwordHash);
  });

  it('rejects wrong password', async () => {
    const r = await accounts.loginCreator({ email: 'alice@example.com', password: 'wrongpassword' });
    assert.ok(r.error);
    assert.ok(r.error.includes('Invalid'));
  });

  it('rejects nonexistent email', async () => {
    const r = await accounts.loginCreator({ email: 'nobody@example.com', password: 'whatever' });
    assert.ok(r.error);
  });

  it('rejects missing fields', async () => {
    const r = await accounts.loginCreator({ email: '', password: '' });
    assert.ok(r.error);
  });
});

// ── Session management ───────────────────────────────────────────────────────

describe('session management', () => {
  let token;

  before(async () => {
    const r = await accounts.loginCreator({ email: 'alice@example.com', password: 'secret123' });
    token = r.token;
  });

  it('validateSession returns creator for valid token', () => {
    const creator = accounts.validateSession(token);
    assert.ok(creator);
    assert.equal(creator.email, 'alice@example.com');
    assert.ok(!creator.passwordHash);
  });

  it('validateSession returns null for invalid token', () => {
    assert.equal(accounts.validateSession('bad-token'), null);
  });

  it('validateSession returns null for null', () => {
    assert.equal(accounts.validateSession(null), null);
  });

  it('destroySession invalidates the token', () => {
    const tempToken = token; // use the real token
    accounts.destroySession(tempToken);
    assert.equal(accounts.validateSession(tempToken), null);
  });
});

// ── Creator admin functions ──────────────────────────────────────────────────

describe('creator admin', () => {
  it('listCreators returns creators without password hashes', () => {
    const list = accounts.listCreators();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    for (const c of list) {
      assert.ok(!c.passwordHash, 'passwordHash leaked for ' + c.email);
      assert.ok(!c.salt, 'salt leaked for ' + c.email);
    }
  });

  it('setCreatorApproval approves a creator', () => {
    const list = accounts.listCreators();
    const alice = list.find(c => c.email === 'alice@example.com');
    const r = accounts.setCreatorApproval(alice.id, true);
    assert.ok(r.ok);
    assert.equal(r.approved, true);
  });

  it('setCreatorApproval rejects unknown ID', () => {
    const r = accounts.setCreatorApproval('cr-nonexistent', true);
    assert.ok(r.error);
  });

  it('recordLessonAuthored adds slug to creator', () => {
    const list = accounts.listCreators();
    const alice = list.find(c => c.email === 'alice@example.com');
    accounts.recordLessonAuthored(alice.id, 'my-lesson');
    accounts.recordLessonAuthored(alice.id, 'my-lesson'); // duplicate — should not add twice
    const updated = accounts.listCreators().find(c => c.id === alice.id);
    assert.equal(updated.lessonsAuthored.filter(s => s === 'my-lesson').length, 1);
  });
});

// ── Student accounts ─────────────────────────────────────────────────────────

describe('student accounts', () => {
  let studentId;

  it('createStudent returns a new student', () => {
    const r = accounts.createStudent({ displayName: 'Charlie', pin: '1234' });
    assert.ok(r.ok);
    assert.ok(r.student.pseudoId.startsWith('px-'));
    assert.equal(r.student.displayName, 'Charlie');
    assert.ok(r.student.pinHash); // PIN is now hashed
    assert.equal(r.student.active, true);
    studentId = r.student.pseudoId;
  });

  it('createStudent works with no arguments', () => {
    const r = accounts.createStudent();
    assert.ok(r.ok);
    assert.ok(r.student.pseudoId.startsWith('px-'));
    assert.equal(r.student.displayName, null);
    assert.equal(r.student.pinHash, null);
  });

  it('createStudentsBulk creates multiple students', () => {
    const r = accounts.createStudentsBulk({ names: ['Dana', 'Eve', 'Frank'], pin: '0000' });
    assert.ok(r.ok);
    assert.equal(r.count, 3);
    assert.equal(r.students.length, 3);
    assert.equal(r.students[0].displayName, 'Dana');
  });

  it('createStudentsBulk rejects empty names', () => {
    const r = accounts.createStudentsBulk({ names: [] });
    assert.ok(r.error);
  });

  it('listStudents returns all students', () => {
    const list = accounts.listStudents();
    assert.ok(list.length >= 5); // 1 + 1 + 3 from above
  });

  it('getStudent returns a specific student', () => {
    const s = accounts.getStudent(studentId);
    assert.ok(s);
    assert.equal(s.displayName, 'Charlie');
  });

  it('getStudent returns null for unknown ID', () => {
    assert.equal(accounts.getStudent('px-nonexistent'), null);
  });

  it('updateStudent modifies name and pin', () => {
    const r = accounts.updateStudent(studentId, { displayName: 'Charles', pin: '5678' });
    assert.ok(r.ok);
    assert.equal(r.student.displayName, 'Charles');
    assert.ok(r.student.pinHash); // PIN is hashed
  });

  it('updateStudent can deactivate', () => {
    const r = accounts.updateStudent(studentId, { active: false });
    assert.ok(r.ok);
    assert.equal(r.student.active, false);
  });
});

// ── Transfer tokens ──────────────────────────────────────────────────────────

describe('transfer tokens', () => {
  let studentId;
  let transferCode;

  before(() => {
    const r = accounts.createStudent({ displayName: 'Transfer Test' });
    studentId = r.student.pseudoId;
  });

  it('generateTransferToken produces a code', () => {
    const r = accounts.generateTransferToken(studentId);
    assert.ok(r.ok);
    assert.ok(r.token);
    assert.ok(r.token.length >= 6);
    assert.ok(r.expiresAt);
    transferCode = r.token;
  });

  it('generateTransferToken rejects unknown student', () => {
    const r = accounts.generateTransferToken('px-unknown');
    assert.ok(r.error);
  });

  it('claimTransferToken returns the pseudoId', () => {
    const r = accounts.claimTransferToken(transferCode);
    assert.ok(r.ok);
    assert.equal(r.pseudoId, studentId);
    assert.equal(r.displayName, 'Transfer Test');
  });

  it('claimTransferToken is one-time use (second claim fails)', () => {
    const r = accounts.claimTransferToken(transferCode);
    assert.ok(r.error);
    assert.ok(r.error.includes('Invalid or expired'));
  });

  it('claimTransferToken rejects empty token', () => {
    const r = accounts.claimTransferToken('');
    assert.ok(r.error);
  });
});

// ── PIN verification ─────────────────────────────────────────────────────────

describe('verifyStudentPin', () => {
  let studentId;

  before(() => {
    const r = accounts.createStudent({ displayName: 'Pin Test', pin: '9999' });
    studentId = r.student.pseudoId;
  });

  it('returns verified for correct PIN', () => {
    const r = accounts.verifyStudentPin(studentId, '9999');
    assert.ok(r.ok);
    assert.ok(r.verified);
  });

  it('returns not verified for wrong PIN', () => {
    const r = accounts.verifyStudentPin(studentId, '0000');
    assert.ok(!r.verified);
  });

  it('returns verified for student with no PIN', () => {
    const s = accounts.createStudent({ displayName: 'No Pin' });
    const r = accounts.verifyStudentPin(s.student.pseudoId, 'anything');
    assert.ok(r.verified);
  });

  it('returns error for unknown student', () => {
    const r = accounts.verifyStudentPin('px-ghost', '1234');
    assert.ok(r.error);
  });
});
