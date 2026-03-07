#!/usr/bin/env node
'use strict';

/**
 * Promote a creator to admin by email.
 * Run after registering via the portal (Author → Log In → Register).
 *
 * Usage: node scripts/promote-admin.js <email>
 * Example: node scripts/promote-admin.js teacher@school.org
 */

const accountsService = require('@agni/services/accounts');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-admin.js <email>');
  console.error('Example: node scripts/promote-admin.js teacher@school.org');
  process.exit(1);
}

async function main() {
  const creators = await accountsService.listCreators();
  const normalized = email.trim().toLowerCase();
  const creator = creators.find(c => (c.email || '').toLowerCase() === normalized);

  if (!creator) {
    console.error(`No creator found with email: ${email}`);
    console.error('Register first via Portal → Author → Log In → Register.');
    process.exit(1);
  }

  const result = await accountsService.setCreatorRole(creator.id, 'admin');
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`Promoted ${creator.name || creator.email} to admin.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
