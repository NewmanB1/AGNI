/**
 * E2E global setup: create an admin user in the shared data dir so tests can
 * use Bearer auth for adminOnly and authOnly routes.
 *
 * Requires: npm run init:data first. Uses AGNI_DATA_DIR (default ./data).
 */
import * as path from 'path';
import * as fs from 'fs';

const DATA_DIR = process.env.AGNI_DATA_DIR || path.join(process.cwd(), 'data');
process.env.AGNI_DATA_DIR = DATA_DIR;
const TOKEN_FILE = path.join(process.cwd(), 'tests', 'e2e', '.e2e-admin-token');

export default async function globalSetup() {
  process.env.AGNI_DATA_DIR = DATA_DIR;

  const creatorsPath = path.join(DATA_DIR, 'creator-accounts.json');
  if (!fs.existsSync(creatorsPath)) {
    console.warn('E2E: data/creator-accounts.json not found. Run: npm run init:data');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const accounts = require('@agni/hub').accounts;
  const email = 'admin@e2e-test.agni';
  const password = 'e2e-admin-pass-1234';

  let result = await accounts.registerCreator({
    name: 'E2E Admin',
    email,
    password,
  });

  if (result.creator) {
    await accounts.setCreatorApproval(result.creator.id, true);
    await accounts.setCreatorRole(result.creator.id, 'admin');
  }

  const login = await accounts.loginCreator({ email, password });
  if (login.token) {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, login.token, 'utf8');
  }
}
