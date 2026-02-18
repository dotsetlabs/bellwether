/**
 * Merge HTTP header maps case-insensitively, preserving latest key casing.
 */
export function mergeHeaderMaps(
  base?: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: Record<string, string> = {};
  if (base) {
    for (const [name, value] of Object.entries(base)) {
      setHeaderCaseInsensitive(merged, name, value);
    }
  }
  if (override) {
    for (const [name, value] of Object.entries(override)) {
      setHeaderCaseInsensitive(merged, name, value);
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Set a header while treating header names as case-insensitive.
 */
export function setHeaderCaseInsensitive(
  headers: Record<string, string>,
  name: string,
  value: string
): void {
  const normalized = name.toLowerCase();
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === normalized) {
      delete headers[existing];
      break;
    }
  }
  headers[name] = value;
}
