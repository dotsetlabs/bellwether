/**
 * Terminal formatting helpers for check command output.
 */

import chalk from 'chalk';
import type { InterviewResult, ToolProfile } from '../../interview/types.js';
import type { ToolProgressSummary } from '../../interview/interviewer.js';
import { RELIABILITY_DISPLAY, CONFIDENCE_INDICATORS, DISPLAY_LIMITS } from '../../constants.js';
import { getOutputConfig } from '../output.js';

export interface CheckSummary {
  fullyTested: number;
  skipped: string[];
  mocked: string[];
  issueTools: string[];
  lines: string[];
  nextSteps: string[];
}

export function formatToolResultLine(summary: ToolProgressSummary): string {
  const statusSymbol = resolveStatusSymbol(summary);
  const toolLabel = summary.toolName;
  const base = `${statusSymbol} ${toolLabel}`;

  if (summary.skipped) {
    const reason = summary.skipReason ?? 'Skipped: external service not configured';
    return `${base} skipped (${reason})`;
  }

  const passPart = `${summary.passedTests}/${summary.totalTests} passed`;
  const validationPart = summary.validationTotal > 0
    ? ` (validation: ${summary.validationPassed}/${summary.validationTotal})`
    : '';
  const timingPart = summary.avgMs > 0 ? ` (${summary.avgMs}ms avg)` : '';
  const mockPart = summary.mocked
    ? ` (mocked${summary.mockService ? `: ${summary.mockService}` : ''})`
    : '';

  return `${base} ${passPart}${validationPart}${mockPart}${timingPart}`;
}

export function buildCheckSummary(result: InterviewResult): CheckSummary {
  const toolProfiles = result.toolProfiles;
  const skipped = toolProfiles.filter(p => p.skipped).map(p => p.name);
  const mocked = toolProfiles.filter(p => p.mocked).map(p => p.name);
  const issueTools = toolProfiles.filter(profileHasIssues).map(p => p.name);
  const fullyTested = toolProfiles.filter(p => !p.skipped && !p.mocked).length;

  const lines: string[] = [];
  lines.push('Summary:');
  lines.push(`✓ ${fullyTested} tools fully tested`);
  if (skipped.length > 0) {
    lines.push(`⚠ ${skipped.length} tools skipped`);
  }
  if (mocked.length > 0) {
    lines.push(`⚠ ${mocked.length} tools mocked`);
  }
  if (issueTools.length > 0) {
    lines.push(`✗ ${issueTools.length} tools have issues`);
  }

  const nextSteps: string[] = [];
  const externalServices = result.metadata.externalServices;
  if (externalServices?.unconfiguredServices.length) {
    const services = externalServices.unconfiguredServices.join(', ');
    nextSteps.push(`Configure ${services} credentials to test skipped tools`);
  }
  if (issueTools.length > 0) {
    const issueList = issueTools.slice(0, DISPLAY_LIMITS.SUMMARY_ISSUE_PREVIEW).join(', ');
    const extra = issueTools.length > DISPLAY_LIMITS.SUMMARY_ISSUE_PREVIEW ? '...' : '';
    nextSteps.push(`Review issues in CONTRACT.md (${issueList}${extra})`);
  }
  if (mocked.length > 0) {
    nextSteps.push('Re-run with real credentials to confirm mocked tool behavior');
  }

  return { fullyTested, skipped, mocked, issueTools, lines, nextSteps };
}

export function formatConfidenceLevel(level?: 'high' | 'medium' | 'low'): string {
  if (!level) {
    return '-';
  }

  const indicator = CONFIDENCE_INDICATORS[level];
  return `${indicator} ${level.toUpperCase()}`;
}

export function colorizeConfidence(label: string, level?: 'high' | 'medium' | 'low'): string {
  if (!level || !supportsColor()) {
    return label;
  }

  switch (level) {
    case 'high':
      return chalk.green(label);
    case 'medium':
      return chalk.yellow(label);
    case 'low':
      return chalk.red(label);
  }
}

export function profileHasIssues(profile: ToolProfile): boolean {
  return profile.interactions.some(i => !i.mocked && i.outcomeAssessment && !i.outcomeAssessment.correct);
}

function resolveStatusSymbol(summary: ToolProgressSummary): string {
  if (summary.skipped) {
    return RELIABILITY_DISPLAY.SYMBOLS.WARN;
  }

  if (summary.totalTests === 0) {
    return RELIABILITY_DISPLAY.SYMBOLS.WARN;
  }

  if (summary.passedTests === summary.totalTests) {
    return RELIABILITY_DISPLAY.SYMBOLS.PASS;
  }

  if (summary.passedTests === 0) {
    return RELIABILITY_DISPLAY.SYMBOLS.FAIL;
  }

  return RELIABILITY_DISPLAY.SYMBOLS.WARN;
}

function supportsColor(): boolean {
  const config = getOutputConfig();
  if (config.noColor) {
    return false;
  }
  return process.stderr.isTTY ?? false;
}
