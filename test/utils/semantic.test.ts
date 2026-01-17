import { describe, it, expect } from 'vitest';
import {
  stem,
  stemText,
  extractStemmedKeywords,
  calculateStemmedKeywordOverlap,
  analyzeNegation,
  isSeverityNegated,
  extractSeverityWithNegation,
  normalizeConstraint,
  compareConstraints,
  extractSecurityCategoryExtended,
  areSemanticallySimular,
} from '../../src/utils/semantic.js';

describe('stem', () => {
  it('should stem regular plurals', () => {
    expect(stem('files')).toBe('file');
    expect(stem('requests')).toBe('request');
    expect(stem('errors')).toBe('error');
  });

  it('should stem -ies plurals', () => {
    expect(stem('directories')).toBe('directory');
    expect(stem('vulnerabilities')).toBe('vulnerability');
  });

  it('should stem -es plurals', () => {
    expect(stem('catches')).toBe('catch');
    expect(stem('passes')).toBe('pass');
  });

  it('should stem -ed past tense', () => {
    expect(stem('validated')).toBe('valid');
    expect(stem('failed')).toBe('fail');
    expect(stem('processed')).toBe('process');
  });

  it('should stem -ing gerunds', () => {
    expect(stem('running')).toBe('run');
    expect(stem('processing')).toBe('process');
  });

  it('should handle irregular verbs', () => {
    expect(stem('ran')).toBe('run');
    expect(stem('wrote')).toBe('write');
    expect(stem('thrown')).toBe('throw');
  });

  it('should handle short words', () => {
    expect(stem('go')).toBe('go');
    expect(stem('a')).toBe('a');
    expect(stem('')).toBe('');
  });

  it('should stem common suffixes', () => {
    expect(stem('quickly')).toBe('quick');
    expect(stem('validation')).toBe('valid');
    expect(stem('readable')).toBe('read');
  });
});

describe('stemText', () => {
  it('should stem all words in text', () => {
    const result = stemText('The files are being processed');
    expect(result).toContain('file');
    expect(result).toContain('process');
  });

  it('should handle punctuation', () => {
    const result = stemText('files, directories, and errors!');
    expect(result).toContain('file');
    expect(result).toContain('directory');
    expect(result).toContain('error');
  });
});

describe('extractStemmedKeywords', () => {
  it('should extract and stem keywords', () => {
    const keywords = extractStemmedKeywords('The files were processed');
    expect(keywords.has('file')).toBe(true);
    expect(keywords.has('process')).toBe(true);
  });

  it('should remove stop words', () => {
    const keywords = extractStemmedKeywords('The file is in the directory');
    expect(keywords.has('the')).toBe(false);
    expect(keywords.has('is')).toBe(false);
    expect(keywords.has('in')).toBe(false);
  });

  it('should handle empty string', () => {
    const keywords = extractStemmedKeywords('');
    expect(keywords.size).toBe(0);
  });
});

describe('calculateStemmedKeywordOverlap', () => {
  it('should match identical texts', () => {
    expect(calculateStemmedKeywordOverlap('file error', 'file error')).toBe(100);
  });

  it('should match with stemming variations', () => {
    const overlap = calculateStemmedKeywordOverlap('files processing', 'file processed');
    expect(overlap).toBeGreaterThan(70);
  });

  it('should return 0 for completely different texts', () => {
    expect(calculateStemmedKeywordOverlap('file error', 'database connection')).toBe(0);
  });

  it('should handle empty texts', () => {
    expect(calculateStemmedKeywordOverlap('', '')).toBe(100);
    expect(calculateStemmedKeywordOverlap('file', '')).toBe(0);
  });
});

describe('analyzeNegation', () => {
  it('should detect simple negation', () => {
    const result = analyzeNegation('not critical');
    expect(result.isNegated).toBe(true);
    expect(result.negatedWords).toContain('critical');
  });

  it('should detect contraction negation', () => {
    const result = analyzeNegation("isn't dangerous");
    expect(result.isNegated).toBe(true);
    expect(result.negatedWords).toContain('dangerous');
  });

  it('should detect multiple negations', () => {
    const result = analyzeNegation('not critical and never dangerous');
    expect(result.isNegated).toBe(true);
    expect(result.negatedWords).toContain('critical');
    expect(result.negatedWords).toContain('dangerous');
  });

  it('should handle no negation', () => {
    const result = analyzeNegation('critical vulnerability');
    expect(result.isNegated).toBe(false);
    expect(result.negatedWords.length).toBe(0);
  });
});

describe('isSeverityNegated', () => {
  it('should detect negated severity', () => {
    expect(isSeverityNegated('not critical', 'critical')).toBe(true);
    expect(isSeverityNegated('this is not a critical issue', 'critical')).toBe(true);
  });

  it('should not flag non-negated severity', () => {
    expect(isSeverityNegated('critical vulnerability', 'critical')).toBe(false);
    expect(isSeverityNegated('this is a critical issue', 'critical')).toBe(false);
  });

  it('should return false if keyword not present', () => {
    expect(isSeverityNegated('not dangerous', 'critical')).toBe(false);
  });
});

describe('extractSeverityWithNegation', () => {
  it('should extract critical severity', () => {
    expect(extractSeverityWithNegation('critical vulnerability')).toBe('critical');
    expect(extractSeverityWithNegation('severe issue')).toBe('critical');
    expect(extractSeverityWithNegation('remote code execution')).toBe('critical');
  });

  it('should extract high severity', () => {
    expect(extractSeverityWithNegation('high risk vulnerability')).toBe('high');
    expect(extractSeverityWithNegation('dangerous injection')).toBe('high');
    expect(extractSeverityWithNegation('path traversal issue')).toBe('high');
  });

  it('should extract medium severity', () => {
    expect(extractSeverityWithNegation('medium risk')).toBe('medium');
    expect(extractSeverityWithNegation('moderate concern')).toBe('medium');
    expect(extractSeverityWithNegation('potential issue')).toBe('medium');
  });

  it('should default to low severity', () => {
    expect(extractSeverityWithNegation('minor issue')).toBe('low');
    expect(extractSeverityWithNegation('informational finding')).toBe('low');
    expect(extractSeverityWithNegation('general observation')).toBe('low');
  });

  it('should handle negation', () => {
    // "not critical" negates critical, defaults to low
    expect(extractSeverityWithNegation('not critical')).toBe('low');
    // "isn't high" negates high, falls through to low
    expect(extractSeverityWithNegation("this isn't a high risk issue")).toBe('low');
    // When critical is negated via "not considered critical", defaults to low
    expect(extractSeverityWithNegation('not considered critical')).toBe('low');
    // A sentence far enough away that medium isn't caught by the negation window
    expect(extractSeverityWithNegation('This is not critical. However, it is a medium severity concern.')).toBe('medium');
  });
});

describe('normalizeConstraint', () => {
  describe('size constraints', () => {
    it('should normalize bytes', () => {
      const result = normalizeConstraint('100bytes');
      expect(result?.type).toBe('size');
      expect(result?.baseValue).toBe(100);
    });

    it('should normalize kilobytes', () => {
      const result = normalizeConstraint('10kb');
      expect(result?.type).toBe('size');
      expect(result?.baseValue).toBe(10 * 1024);
    });

    it('should normalize megabytes', () => {
      const result = normalizeConstraint('10MB');
      expect(result?.type).toBe('size');
      expect(result?.baseValue).toBe(10 * 1024 * 1024);
    });

    it('should normalize gigabytes', () => {
      const result = normalizeConstraint('1GB');
      expect(result?.type).toBe('size');
      expect(result?.baseValue).toBe(1024 * 1024 * 1024);
    });
  });

  describe('time constraints', () => {
    it('should normalize milliseconds', () => {
      const result = normalizeConstraint('100ms');
      expect(result?.type).toBe('time');
      expect(result?.baseValue).toBe(100);
    });

    it('should normalize seconds', () => {
      const result = normalizeConstraint('30seconds');
      expect(result?.type).toBe('time');
      expect(result?.baseValue).toBe(30000);
    });

    it('should normalize minutes', () => {
      const result = normalizeConstraint('5minutes');
      expect(result?.type).toBe('time');
      expect(result?.baseValue).toBe(5 * 60 * 1000);
    });
  });

  describe('rate constraints', () => {
    it('should normalize per-second rates', () => {
      const result = normalizeConstraint('100requests/s');
      expect(result?.type).toBe('rate');
      expect(result?.baseValue).toBe(100);
    });

    it('should normalize per-minute rates', () => {
      const result = normalizeConstraint('60requests/min');
      expect(result?.type).toBe('rate');
      expect(result?.baseValue).toBe(1); // 60 per minute = 1 per second
    });
  });

  it('should normalize count constraints', () => {
    const result = normalizeConstraint('100');
    expect(result?.type).toBe('count');
    expect(result?.value).toBe(100);
  });

  it('should return undefined for unparseable constraints', () => {
    expect(normalizeConstraint('')).toBeUndefined();
    expect(normalizeConstraint('invalid')).toBeUndefined();
  });
});

describe('compareConstraints', () => {
  it('should match identical constraints', () => {
    expect(compareConstraints('10MB', '10MB')).toBe(100);
  });

  it('should match constraints with different spacing', () => {
    expect(compareConstraints('10MB', '10 MB')).toBe(100);
  });

  it('should match equivalent constraints in different units', () => {
    // 10MB = 10240KB
    const similarity = compareConstraints('10MB', '10240KB');
    expect(similarity).toBeGreaterThan(80);
  });

  it('should match similar constraints', () => {
    // Within 10% should score high
    const similarity = compareConstraints('10MB', '11MB');
    expect(similarity).toBeGreaterThan(70);
  });

  it('should return low score for different constraints', () => {
    const similarity = compareConstraints('10MB', '100MB');
    expect(similarity).toBeLessThan(60);
  });

  it('should handle missing constraints', () => {
    expect(compareConstraints(undefined, undefined)).toBe(100);
    expect(compareConstraints('10MB', undefined)).toBe(50);
    expect(compareConstraints(undefined, '10MB')).toBe(50);
  });
});

describe('extractSecurityCategoryExtended', () => {
  it('should extract path traversal', () => {
    expect(extractSecurityCategoryExtended('path traversal vulnerability')).toBe('path_traversal');
    expect(extractSecurityCategoryExtended('contains ../ in path')).toBe('path_traversal');
  });

  it('should extract command injection', () => {
    expect(extractSecurityCategoryExtended('command injection risk')).toBe('command_injection');
    expect(extractSecurityCategoryExtended('shell injection possible')).toBe('command_injection');
  });

  it('should extract SQL injection', () => {
    expect(extractSecurityCategoryExtended('SQL injection vulnerability')).toBe('sql_injection');
  });

  it('should extract XSS', () => {
    expect(extractSecurityCategoryExtended('cross-site scripting')).toBe('xss');
    expect(extractSecurityCategoryExtended('XSS vulnerability')).toBe('xss');
  });

  it('should extract XXE (new category)', () => {
    expect(extractSecurityCategoryExtended('XXE vulnerability')).toBe('xxe');
    expect(extractSecurityCategoryExtended('XML external entity injection')).toBe('xxe');
  });

  it('should extract timing attack (new category)', () => {
    expect(extractSecurityCategoryExtended('timing attack possible')).toBe('timing_attack');
    expect(extractSecurityCategoryExtended('side-channel vulnerability')).toBe('timing_attack');
  });

  it('should extract race condition (new category)', () => {
    expect(extractSecurityCategoryExtended('race condition detected')).toBe('race_condition');
    expect(extractSecurityCategoryExtended('TOCTOU vulnerability')).toBe('race_condition');
  });

  it('should extract deserialization (new category)', () => {
    expect(extractSecurityCategoryExtended('unsafe deserialization')).toBe('deserialization');
    expect(extractSecurityCategoryExtended('object injection via pickle')).toBe('deserialization');
  });

  it('should extract prototype pollution (new category)', () => {
    expect(extractSecurityCategoryExtended('prototype pollution vulnerability')).toBe('prototype_pollution');
  });

  it('should extract open redirect (new category)', () => {
    expect(extractSecurityCategoryExtended('open redirect vulnerability')).toBe('open_redirect');
  });

  it('should extract SSRF', () => {
    expect(extractSecurityCategoryExtended('SSRF vulnerability')).toBe('ssrf');
    expect(extractSecurityCategoryExtended('server-side request forgery')).toBe('ssrf');
  });

  it('should return other for unknown', () => {
    // Use text that doesn't match any security keywords
    expect(extractSecurityCategoryExtended('hello world example')).toBe('other');
    expect(extractSecurityCategoryExtended('weather forecast today')).toBe('other');
  });
});

describe('areSemanticallySimular', () => {
  it('should match similar texts', () => {
    expect(areSemanticallySimular('file read error', 'files reading errors')).toBe(true);
  });

  it('should not match different texts', () => {
    expect(areSemanticallySimular('file read error', 'database connection')).toBe(false);
  });

  it('should respect threshold', () => {
    expect(areSemanticallySimular('file read', 'file write', 80)).toBe(false);
    expect(areSemanticallySimular('file read', 'file write', 30)).toBe(true);
  });
});
