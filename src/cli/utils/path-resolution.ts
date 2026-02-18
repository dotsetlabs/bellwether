import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';

/**
 * Resolve a possibly relative path against the output directory.
 */
export function resolvePathFromOutputDir(path: string, outputDir: string): string {
  return isAbsolute(path) ? path : join(outputDir, path);
}

/**
 * Resolve path using output dir first, then cwd fallback.
 * Keeps existing baseline compare behavior for user-provided relative paths.
 */
export function resolvePathFromOutputDirOrCwd(path: string, outputDir: string): string {
  if (isAbsolute(path)) {
    return path;
  }

  const outputDirPath = join(outputDir, path);
  if (existsSync(outputDirPath)) {
    return outputDirPath;
  }

  const cwdPath = join(process.cwd(), path);
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  return outputDirPath;
}
