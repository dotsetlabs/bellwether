/**
 * Verified by Bellwether program module.
 */

export {
  generateVerificationResult,
  generateVerificationReport,
  generateVerificationBadge,
  generateBadgeUrl,
  generateBadgeMarkdown,
  isVerificationValid,
} from './verifier.js';

export type {
  VerificationStatus,
  VerificationTier,
  VerificationResult,
  VerificationBadge,
  VerificationConfig,
  VerificationReport,
  VerificationSubmission,
} from './types.js';
