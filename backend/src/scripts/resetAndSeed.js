// Wipes ALL app data and seeds a single verified superadmin account.
//
// Production (MongoDB on Render — copy MONGODB_URI from Render dashboard):
//   $env:DB_PROVIDER="mongo"
//   $env:MONGODB_URI="mongodb+srv://..."
//   node backend/src/scripts/resetAndSeed.js aayush.cse24@cmrit.ac.in YourPassword123 "Aayush"
//
// Local (JSON storage):
//   node backend/src/scripts/resetAndSeed.js aayush.cse24@cmrit.ac.in YourPassword123 "Aayush"
//
// Add --yes to skip the confirmation prompt.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { MongoClient } from 'mongodb';
import { createDefaultProfile } from '../services/profileTemplate.js';
import { dataFilePath } from '../utils/paths.js';

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const positional = args.filter((a) => a !== '--yes');

const ADMIN_EMAIL = String(positional[0] || 'aayush.cse24@cmrit.ac.in').toLowerCase();
const ADMIN_PASSWORD = String(positional[1] || '');
const ADMIN_NAME = String(positional[2] || 'Aayush');

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
  console.error('Usage: node backend/src/scripts/resetAndSeed.js [email] <password> [name] [--yes]');
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const COLLECTIONS = [
  'users',
  'profiles',
  'refreshTokens',
  'passwordResetTokens',
  'verificationTokens',
  'conversations',
  'connectionRequests',
  'projectRequests',
  'auditLogs',
  'ideas',
];

const buildSeed = async () => {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const user = {
    id: userId,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    passwordHash,
    provider: 'local',
    role: 'superadmin',
    googleId: null,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  const profile = createDefaultProfile({ userId, name: ADMIN_NAME, email: ADMIN_EMAIL });
  return { user, profile };
};

const provider = (process.env.DB_PROVIDER || (process.env.MONGODB_URI ? 'mongo' : 'json')).toLowerCase();

const describeTarget = () => {
  if (provider === 'mongo') {
    let host = 'unknown';
    try {
      host = new URL(process.env.MONGODB_URI).host;
    } catch { /* keep 'unknown' */ }
    return `MongoDB (db: ${process.env.MONGODB_DB_NAME || 'collab_portal'}, host: ${host})`;
  }
  return `local JSON file (${dataFilePath})`;
};

const confirm = async () => {
  if (skipConfirm) return;
  console.log('\n  ⚠️  THIS DELETES ALL USERS, MESSAGES, IDEAS, AND TOKENS — PERMANENTLY.');
  console.log(`  Target: ${describeTarget()}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('  Type WIPE to continue: ');
  rl.close();
  if (String(answer).trim().toUpperCase() !== 'WIPE') {
    console.log('Aborted. Nothing was deleted.');
    process.exit(0);
  }
};

const run = async () => {
  await confirm();

  if (provider === 'mongo') {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('MONGODB_URI is required when DB_PROVIDER=mongo');
      process.exit(1);
    }

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'collab_portal');

    for (const name of COLLECTIONS) {
      await db.collection(name).deleteMany({});
    }
    console.log(`Wiped ${COLLECTIONS.length} collections on ${describeTarget()}.`);

    const { user, profile } = await buildSeed();
    await db.collection('users').insertOne(user);
    await db.collection('profiles').updateOne(
      { userId: user.id },
      { $set: { userId: user.id, profile } },
      { upsert: true }
    );
    await db.collection('auditLogs').insertOne({
      id: crypto.randomUUID(),
      actorId: user.id,
      actorRole: 'superadmin',
      action: 'system.reset-seed',
      targetUserId: user.id,
      details: { email: user.email },
      createdAt: new Date().toISOString(),
    });

    const check = await db.collection('users').findOne({ email: ADMIN_EMAIL });
    if (!check) {
      console.error('Seed verification failed — user not found after insert.');
      await client.close();
      process.exit(1);
    }

    console.log(`Seeded verified superadmin: ${ADMIN_EMAIL}`);
    await client.close();
  } else {
    const { user, profile } = await buildSeed();
    const data = {
      users: [user],
      profiles: { [user.id]: profile },
      refreshTokens: [],
      passwordResetTokens: [],
      verificationTokens: [],
      conversations: [],
      connectionRequests: [],
      projectRequests: [],
      auditLogs: [{
        id: crypto.randomUUID(),
        actorId: user.id,
        actorRole: 'superadmin',
        action: 'system.reset-seed',
        targetUserId: user.id,
        details: { email: user.email },
        createdAt: new Date().toISOString(),
      }],
      ideas: [],
    };
    fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Wrote fresh ${dataFilePath}`);
    console.log(`Seeded verified superadmin: ${ADMIN_EMAIL}`);
  }

  console.log('\nDone. Log in with:');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: (the one you provided)\n`);
};

run().catch((err) => {
  console.error('resetAndSeed failed:', err);
  process.exit(1);
});
