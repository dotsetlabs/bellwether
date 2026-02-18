/**
 * Utilities for parsing and merging HTTP headers from CLI/config.
 */

import { mergeHeaderMaps, setHeaderCaseInsensitive } from '../../utils/http-headers.js';

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Parse CLI --header values ("Name: value") into a validated header map.
 */
export function parseCliHeaders(values?: string[]): Record<string, string> | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  for (const raw of values) {
    const separator = raw.indexOf(':');
    if (separator <= 0) {
      throw new Error(
        `Invalid header "${raw}". Expected format: "Name: value" (example: "Authorization: Bearer token").`
      );
    }

    const name = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();

    if (!name) {
      throw new Error(`Invalid header "${raw}". Header name cannot be empty.`);
    }
    if (!HEADER_NAME_PATTERN.test(name)) {
      throw new Error(
        `Invalid header name "${name}". Header names may only include RFC 7230 token characters.`
      );
    }
    if (value.includes('\n') || value.includes('\r')) {
      throw new Error(`Invalid header "${name}". Header value cannot contain newlines.`);
    }

    setHeaderCaseInsensitive(headers, name, value);
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Merge two header maps case-insensitively, with override precedence.
 */
export function mergeHeaders(
  base?: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> | undefined {
  return mergeHeaderMaps(base, override);
}
