#!/usr/bin/env node

import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform === 'win32') {
  process.exit(0);
}

const cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
if (!existsSync(cliPath)) {
  process.exit(0);
}

try {
  chmodSync(cliPath, 0o755);
} catch (error) {
  console.warn(`postbuild: unable to mark ${cliPath} executable: ${String(error)}`);
}
