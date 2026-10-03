import fs from 'node:fs';
import path from 'node:path';
import { dataFilePath } from '../utils/paths.js';

const ensureDb = () => {
  const dir = path.dirname(dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataFilePath)) {
    const initial = {
      users: [],
      profiles: {},
    };
    fs.writeFileSync(dataFilePath, JSON.stringify(initial, null, 2), 'utf-8');
  }
};

export const readDb = () => {
  ensureDb();
  const raw = fs.readFileSync(dataFilePath, 'utf-8');
  return JSON.parse(raw);
};

export const writeDb = (data) => {
  ensureDb();
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
};
