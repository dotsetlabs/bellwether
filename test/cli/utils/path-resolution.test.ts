import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolvePathFromOutputDir,
  resolvePathFromOutputDirOrCwd,
} from '../../../src/cli/utils/path-resolution.js';

describe('path resolution helpers', () => {
  let testDir: string;
  let outputDir: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-path-resolution-${Date.now()}-${Math.random()}`);
    outputDir = join(testDir, '.bellwether');
    mkdirSync(outputDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it('resolves relative paths under output.dir', () => {
    const resolved = resolvePathFromOutputDir('bellwether-baseline.json', outputDir);
    expect(resolved).toBe(join(outputDir, 'bellwether-baseline.json'));
  });

  it('keeps absolute paths unchanged', () => {
    const absolute = join(testDir, 'absolute-baseline.json');
    const resolved = resolvePathFromOutputDir(absolute, outputDir);
    expect(resolved).toBe(absolute);
  });

  it('prefers output.dir when path exists in both output.dir and cwd', () => {
    const outputPath = join(outputDir, 'shared.json');
    const cwdPath = join(testDir, 'shared.json');
    writeFileSync(outputPath, '{}');
    writeFileSync(cwdPath, '{}');

    const resolved = resolvePathFromOutputDirOrCwd('shared.json', outputDir);
    expect(resolved).toBe(outputPath);
  });

  it('falls back to cwd when output.dir candidate does not exist', () => {
    const cwdPath = join(testDir, '.bellwether', 'bellwether-baseline.json');
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });
    writeFileSync(cwdPath, '{}');

    const resolved = resolvePathFromOutputDirOrCwd(
      './.bellwether/bellwether-baseline.json',
      outputDir
    );
    expect(realpathSync(resolved)).toBe(realpathSync(cwdPath));
  });

  it('returns output.dir candidate when no file exists yet', () => {
    const resolved = resolvePathFromOutputDirOrCwd('new-baseline.json', outputDir);
    expect(resolved).toBe(join(outputDir, 'new-baseline.json'));
  });
});
