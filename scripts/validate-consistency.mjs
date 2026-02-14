#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packageVersion = String(packageJson.version ?? '').trim();
const packageMajor = packageVersion.split('.')[0];

if (!packageVersion || !/^\d+\.\d+\.\d+$/.test(packageVersion)) {
  console.error('Invalid package.json version, expected semver x.y.z');
  process.exit(1);
}

const errors = [];

function walkMarkdownFiles(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath);
    }
  }
  return out;
}

function report(path, message) {
  errors.push(`${relative(root, path)}: ${message}`);
}

function getLineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

const markdownTargets = [join(root, 'README.md'), ...walkMarkdownFiles(join(root, 'website', 'docs'))];

for (const file of markdownTargets) {
  const content = readFileSync(file, 'utf8');

  const actionRefRegex = /dotsetlabs\/bellwether@v(\d+\.\d+\.\d+)/g;
  for (const match of content.matchAll(actionRefRegex)) {
    const found = match[1];
    if (found !== packageVersion) {
      const line = getLineNumber(content, match.index ?? 0);
      report(file, `stale action ref v${found} on line ${line}; expected v${packageVersion}`);
    }
  }

  const inputVersionRegex = /\bversion:\s*['"](\d+\.\d+\.\d+)['"]/g;
  for (const match of content.matchAll(inputVersionRegex)) {
    const found = match[1];
    if (found !== packageVersion) {
      const line = getLineNumber(content, match.index ?? 0);
      report(file, `stale action input version ${found} on line ${line}; expected ${packageVersion}`);
    }
  }
}

const securityPath = join(root, 'SECURITY.md');
if (existsSync(securityPath)) {
  const securityText = readFileSync(securityPath, 'utf8');
  const supportedPattern = new RegExp(`\\|\\s*${packageMajor}\\.x\\.x\\s*\\|\\s*Yes\\s*\\|`);
  if (!supportedPattern.test(securityText)) {
    report(
      securityPath,
      `supported versions matrix must include "| ${packageMajor}.x.x | Yes |" for current major`
    );
  }
}

const docusaurusConfigPath = join(root, 'website', 'docusaurus.config.ts');
if (existsSync(docusaurusConfigPath)) {
  const docusaurusText = readFileSync(docusaurusConfigPath, 'utf8');
  const blobLinkRegex = /blob\/main\/([^'")\s]+)/g;
  for (const match of docusaurusText.matchAll(blobLinkRegex)) {
    const repoRelativePath = match[1];
    const localPath = join(root, repoRelativePath);
    if (!existsSync(localPath) || !statSync(localPath).isFile()) {
      report(docusaurusConfigPath, `broken GitHub blob link target: ${repoRelativePath}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Consistency validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Consistency validation passed for version ${packageVersion}`);
