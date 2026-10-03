import 'dotenv/config';
import fs from 'node:fs';
import { MongoClient } from 'mongodb';
import { dataFilePath } from '../utils/paths.js';

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI before running migration.');
  }

  const dbName = process.env.MONGODB_DB_NAME || 'collab_portal';
  const source = fs.existsSync(dataFilePath)
    ? JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'))
    : { users: [], profiles: {}, refreshTokens: [], passwordResetTokens: [], conversations: [], auditLogs: [] };

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(dbName);

  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('profiles').deleteMany({}),
    db.collection('refreshTokens').deleteMany({}),
    db.collection('passwordResetTokens').deleteMany({}),
    db.collection('conversations').deleteMany({}),
    db.collection('auditLogs').deleteMany({}),
  ]);

  if (source.users?.length) {
    await db.collection('users').insertMany(source.users);
  }

  const profiles = Object.entries(source.profiles || {}).map(([userId, profile]) => ({ userId, profile }));
  if (profiles.length) {
    await db.collection('profiles').insertMany(profiles);
  }

  if (source.refreshTokens?.length) {
    await db.collection('refreshTokens').insertMany(source.refreshTokens);
  }

  if (source.passwordResetTokens?.length) {
    await db.collection('passwordResetTokens').insertMany(source.passwordResetTokens);
  }

  if (source.conversations?.length) {
    await db.collection('conversations').insertMany(source.conversations);
  }

  if (source.auditLogs?.length) {
    await db.collection('auditLogs').insertMany(source.auditLogs);
  }

  await client.close();
  console.log(`Migration complete to MongoDB database: ${dbName}`);
};

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
