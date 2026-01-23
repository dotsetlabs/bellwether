/**
 * Semantic type inference and validation.
 *
 * This module defines semantic types that can be inferred from parameter
 * names and descriptions, enabling more intelligent validation testing.
 */

/**
 * Semantic types that can be inferred from parameter descriptions.
 * Used to generate targeted validation tests.
 */
export type SemanticType =
  | 'date_iso8601'      // YYYY-MM-DD
  | 'date_month'        // YYYY-MM
  | 'datetime'          // ISO 8601 datetime
  | 'timestamp'         // Unix timestamp
  | 'amount_currency'   // Monetary amount
  | 'percentage'        // 0-100 or 0-1
  | 'identifier'        // UUID, ID string
  | 'email'             // Email address
  | 'url'               // URL/URI
  | 'phone'             // Phone number
  | 'ip_address'        // IPv4/IPv6
  | 'file_path'         // File system path
  | 'json'              // JSON string
  | 'base64'            // Base64 encoded
  | 'regex'             // Regular expression
  | 'unknown';          // Cannot determine

/**
 * Inference result for a parameter.
 * Contains the inferred semantic type and confidence level.
 */
export interface SemanticInference {
  /** Parameter name that was analyzed */
  paramName: string;
  /** The inferred semantic type */
  inferredType: SemanticType;
  /** Confidence level (0-1) */
  confidence: number;
  /** Evidence supporting the inference */
  evidence: string[];
}

/**
 * Result of validating a value against an expected semantic type.
 */
export interface SemanticValidationResult {
  /** Parameter name that was validated */
  paramName: string;
  /** The expected semantic type */
  expectedType: SemanticType;
  /** The value that was validated */
  providedValue: unknown;
  /** Whether the value is valid for the expected type */
  isValid: boolean;
  /** Description of the validation issue (if invalid) */
  issue?: string;
}

/**
 * Pattern definition for semantic type inference.
 * Contains patterns to match against parameter names and descriptions.
 */
export interface SemanticPatternDefinition {
  /** Patterns to match against parameter names */
  namePatterns: RegExp[];
  /** Patterns to match against parameter descriptions */
  descriptionPatterns: RegExp[];
  /** Optional patterns to validate actual values */
  formatPatterns?: RegExp[];
}

/**
 * Patterns for semantic type inference.
 * Maps each semantic type to patterns that indicate that type.
 */
export const SEMANTIC_PATTERNS: Record<SemanticType, SemanticPatternDefinition> = {
  date_iso8601: {
    namePatterns: [/date/i, /day/i, /_at$/i, /created/i, /updated/i, /birth/i, /expir/i],
    descriptionPatterns: [/YYYY-MM-DD/i, /ISO.?8601/i, /date format/i, /date string/i],
    formatPatterns: [/^\d{4}-\d{2}-\d{2}$/],
  },
  date_month: {
    namePatterns: [/month/i, /period/i, /billing_?month/i],
    descriptionPatterns: [/YYYY-MM/i, /month format/i, /year-month/i],
    formatPatterns: [/^\d{4}-\d{2}$/],
  },
  datetime: {
    namePatterns: [/datetime/i, /timestamp/i, /time$/i, /created_?at/i, /updated_?at/i],
    descriptionPatterns: [/ISO.?8601/i, /datetime/i, /\d{4}-\d{2}-\d{2}T/, /RFC.?3339/i],
    formatPatterns: [/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/],
  },
  timestamp: {
    namePatterns: [/timestamp/i, /unix/i, /epoch/i, /time_?ms/i, /millis/i],
    descriptionPatterns: [/unix/i, /epoch/i, /milliseconds/i, /seconds since/i, /timestamp/i],
  },
  amount_currency: {
    namePatterns: [/amount/i, /price/i, /cost/i, /fee/i, /total/i, /balance/i, /payment/i, /charge/i],
    descriptionPatterns: [/currency/i, /dollar/i, /USD/i, /EUR/i, /amount/i, /monetary/i, /cents/i],
  },
  percentage: {
    namePatterns: [/percent/i, /rate/i, /ratio/i, /progress/i, /completion/i],
    descriptionPatterns: [/percent/i, /0-100/i, /0-1/i, /proportion/i, /percentage/i],
  },
  identifier: {
    namePatterns: [/id$/i, /_id/i, /uuid/i, /guid/i, /sku/i, /code$/i],
    descriptionPatterns: [/identifier/i, /UUID/i, /unique/i, /GUID/i],
  },
  email: {
    namePatterns: [/email/i, /mail/i, /e_?mail/i],
    descriptionPatterns: [/email/i, /@/, /e-mail/i],
    formatPatterns: [/^[\w.-]+@[\w.-]+\.\w+$/],
  },
  url: {
    namePatterns: [/url/i, /uri/i, /link/i, /href/i, /endpoint/i, /website/i],
    descriptionPatterns: [/URL/i, /URI/i, /http/i, /link/i, /web address/i],
    formatPatterns: [/^https?:\/\//i],
  },
  phone: {
    namePatterns: [/phone/i, /tel/i, /mobile/i, /cell/i, /fax/i],
    descriptionPatterns: [/phone/i, /telephone/i, /mobile/i, /number/i],
  },
  ip_address: {
    namePatterns: [/ip/i, /ip_?address/i, /host/i, /server_?ip/i],
    descriptionPatterns: [/IP address/i, /IPv4/i, /IPv6/i, /internet protocol/i],
  },
  file_path: {
    namePatterns: [/path/i, /file/i, /directory/i, /dir/i, /folder/i, /filename/i],
    descriptionPatterns: [/path/i, /file/i, /directory/i, /folder/i],
  },
  json: {
    namePatterns: [/json/i, /data/i, /payload/i, /body/i, /config/i],
    descriptionPatterns: [/JSON/i, /object/i, /serialized/i],
  },
  base64: {
    namePatterns: [/base64/i, /encoded/i, /b64/i],
    descriptionPatterns: [/base64/i, /encoded/i, /binary/i],
  },
  regex: {
    namePatterns: [/regex/i, /pattern/i, /expression/i, /regexp/i],
    descriptionPatterns: [/regex/i, /regular expression/i, /pattern/i, /regexp/i],
  },
  unknown: {
    namePatterns: [],
    descriptionPatterns: [],
  },
};

/**
 * Get all known semantic types (excluding 'unknown').
 */
export function getAllSemanticTypes(): SemanticType[] {
  return Object.keys(SEMANTIC_PATTERNS).filter(
    (t) => t !== 'unknown'
  ) as SemanticType[];
}

/**
 * Check if a value is a valid SemanticType.
 */
export function isSemanticType(value: string): value is SemanticType {
  return value in SEMANTIC_PATTERNS;
}
