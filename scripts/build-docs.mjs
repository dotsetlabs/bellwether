#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, '..');
const websiteDir = join(rootDir, 'website');
const docusaurusCliPath = join(websiteDir, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');
const npmCacheDir = join(rootDir, '.npm-cache');
const commandEnv = {
  ...process.env,
  npm_config_cache: process.env.npm_config_cache ?? npmCacheDir,
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: commandEnv,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

if (!existsSync(docusaurusCliPath)) {
  console.log('docs: website dependencies missing; running npm ci in ./website');
  const installExitCode = run(
    npmCommand(),
    ['ci', '--no-audit', '--no-fund', '--cache', npmCacheDir],
    websiteDir
  );
  if (installExitCode !== 0) {
    console.error('\ndocs: failed to install website dependencies.');
    console.error('Try running `npm --prefix website ci` and ensure network access to registry.npmjs.org.');
    process.exit(installExitCode);
  }
}

if (!existsSync(docusaurusCliPath)) {
  console.error('docs: docusaurus CLI is still missing after install.');
  process.exit(1);
}

const buildExitCode = run(process.execPath, [docusaurusCliPath, 'build'], websiteDir);
process.exit(buildExitCode);
