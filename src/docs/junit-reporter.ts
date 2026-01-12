/**
 * JUnit XML reporter for test runner integration.
 */

import type { InterviewResult, ToolProfile, ToolInteraction } from '../interview/types.js';
import type { BehavioralDiff } from '../baseline/types.js';

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate JUnit XML report from interview results.
 *
 * Each tool becomes a test suite, and each interaction becomes a test case.
 */
export function generateJunitReport(result: InterviewResult): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Calculate totals
  const totalTests = result.toolProfiles.reduce(
    (sum, p) => sum + p.interactions.length,
    0
  );
  const failures = result.toolProfiles.reduce(
    (sum, p) => sum + p.interactions.filter((i) => i.error).length,
    0
  );
  const durationSeconds = result.metadata.durationMs / 1000;

  lines.push(
    `<testsuites name="${escapeXml(result.discovery.serverInfo.name)}" ` +
    `tests="${totalTests}" failures="${failures}" errors="0" ` +
    `time="${durationSeconds.toFixed(3)}">`
  );

  // Each tool is a test suite
  for (const profile of result.toolProfiles) {
    lines.push(generateToolSuite(profile));
  }

  // Add workflow test suites if present
  if (result.workflowResults && result.workflowResults.length > 0) {
    lines.push(generateWorkflowSuites(result));
  }

  lines.push('</testsuites>');

  return lines.join('\n');
}

/**
 * Generate a test suite for a single tool.
 */
function generateToolSuite(profile: ToolProfile): string {
  const lines: string[] = [];

  const tests = profile.interactions.length;
  const failures = profile.interactions.filter((i) => i.error).length;
  const duration = profile.interactions.reduce((sum, i) => sum + i.durationMs, 0) / 1000;

  lines.push(
    `  <testsuite name="${escapeXml(profile.name)}" ` +
    `tests="${tests}" failures="${failures}" errors="0" ` +
    `time="${duration.toFixed(3)}" ` +
    `timestamp="${new Date().toISOString()}">`
  );

  // Tool description as property
  lines.push('    <properties>');
  lines.push(`      <property name="description" value="${escapeXml(profile.description)}"/>`);
  lines.push('    </properties>');

  // Each interaction is a test case
  for (const interaction of profile.interactions) {
    lines.push(generateTestCase(profile.name, interaction));
  }

  // Add behavioral note test cases (pass by default)
  for (let i = 0; i < profile.behavioralNotes.length; i++) {
    lines.push(
      `    <testcase name="behavioral_note_${i + 1}" classname="${escapeXml(profile.name)}" time="0">`
    );
    lines.push(`      <system-out>${escapeXml(profile.behavioralNotes[i])}</system-out>`);
    lines.push('    </testcase>');
  }

  // Add security notes as warnings
  for (let i = 0; i < profile.securityNotes.length; i++) {
    lines.push(
      `    <testcase name="security_note_${i + 1}" classname="${escapeXml(profile.name)}" time="0">`
    );
    lines.push(
      `      <system-err>Security consideration: ${escapeXml(profile.securityNotes[i])}</system-err>`
    );
    lines.push('    </testcase>');
  }

  lines.push('  </testsuite>');

  return lines.join('\n');
}

/**
 * Generate a test case for a single interaction.
 */
function generateTestCase(toolName: string, interaction: ToolInteraction): string {
  const lines: string[] = [];
  const duration = interaction.durationMs / 1000;

  const testName = escapeXml(interaction.question.description);
  const className = escapeXml(toolName);

  lines.push(
    `    <testcase name="${testName}" classname="${className}" time="${duration.toFixed(3)}">`
  );

  if (interaction.error) {
    lines.push('      <failure message="Tool call failed">');
    lines.push(`        ${escapeXml(interaction.error)}`);
    lines.push('      </failure>');
  }

  // Include the analysis as system-out
  if (interaction.analysis) {
    lines.push(`      <system-out>${escapeXml(interaction.analysis)}</system-out>`);
  }

  lines.push('    </testcase>');

  return lines.join('\n');
}

/**
 * Generate test suites for workflows.
 */
function generateWorkflowSuites(result: InterviewResult): string {
  const lines: string[] = [];

  if (!result.workflowResults) return '';

  for (const wr of result.workflowResults) {
    const tests = wr.steps.length;
    const failures = wr.steps.filter((s) => !s.success).length;

    lines.push(
      `  <testsuite name="workflow:${escapeXml(wr.workflow.name)}" ` +
      `tests="${tests}" failures="${failures}" errors="0" time="0">`
    );

    lines.push('    <properties>');
    lines.push(
      `      <property name="description" value="${escapeXml(wr.workflow.description)}"/>`
    );
    lines.push(
      `      <property name="expectedOutcome" value="${escapeXml(wr.workflow.expectedOutcome)}"/>`
    );
    lines.push('    </properties>');

    // Each step is a test case
    for (let i = 0; i < wr.steps.length; i++) {
      const stepResult = wr.steps[i];
      const step = stepResult.step;

      lines.push(
        `    <testcase name="step_${i + 1}:${escapeXml(step.tool)}" ` +
        `classname="workflow:${escapeXml(wr.workflow.name)}" time="0">`
      );

      if (!stepResult.success) {
        lines.push('      <failure message="Step failed">');
        if (stepResult.error) {
          lines.push(`        ${escapeXml(stepResult.error)}`);
        }
        lines.push('      </failure>');
      }

      if (stepResult.analysis) {
        lines.push(`      <system-out>${escapeXml(stepResult.analysis)}</system-out>`);
      }

      lines.push('    </testcase>');
    }

    lines.push('  </testsuite>');
  }

  return lines.join('\n');
}

/**
 * Generate JUnit XML report from behavioral diff.
 *
 * Treats drift detection as a test suite.
 */
export function generateJunitFromDiff(diff: BehavioralDiff): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  const tests =
    diff.toolsRemoved.length +
    diff.toolsAdded.length +
    diff.toolsModified.length +
    diff.behaviorChanges.length;

  const failures = diff.breakingCount;
  const errors = diff.toolsRemoved.length;

  lines.push(
    `<testsuites name="Behavioral Drift Detection" ` +
    `tests="${tests}" failures="${failures}" errors="${errors}" time="0">`
  );

  // Tool changes suite
  lines.push(
    `  <testsuite name="tool_changes" tests="${diff.toolsRemoved.length + diff.toolsAdded.length + diff.toolsModified.length}" failures="0" errors="${diff.toolsRemoved.length}">`
  );

  // Removed tools are errors
  for (const tool of diff.toolsRemoved) {
    lines.push(
      `    <testcase name="tool_present:${escapeXml(tool)}" classname="drift.tools">`
    );
    lines.push('      <error message="Tool was removed">');
    lines.push(`        Tool "${escapeXml(tool)}" is no longer present on the server`);
    lines.push('      </error>');
    lines.push('    </testcase>');
  }

  // Added tools are pass with info
  for (const tool of diff.toolsAdded) {
    lines.push(
      `    <testcase name="new_tool:${escapeXml(tool)}" classname="drift.tools">`
    );
    lines.push(`      <system-out>New tool discovered: ${escapeXml(tool)}</system-out>`);
    lines.push('    </testcase>');
  }

  // Modified tools
  for (const toolDiff of diff.toolsModified) {
    const hasHighChanges = toolDiff.changes.some((c) => c.significance === 'high');

    lines.push(
      `    <testcase name="tool_unchanged:${escapeXml(toolDiff.tool)}" classname="drift.tools">`
    );

    if (hasHighChanges || toolDiff.schemaChanged) {
      lines.push('      <failure message="Tool behavior changed">');
      if (toolDiff.schemaChanged) {
        lines.push('        Schema changed');
      }
      for (const change of toolDiff.changes) {
        lines.push(`        ${escapeXml(change.description)}`);
      }
      lines.push('      </failure>');
    } else {
      lines.push(`      <system-out>Minor changes detected</system-out>`);
    }

    lines.push('    </testcase>');
  }

  lines.push('  </testsuite>');

  // Behavior changes suite
  if (diff.behaviorChanges.length > 0) {
    const behaviorFailures = diff.behaviorChanges.filter(
      (c) => c.significance === 'high'
    ).length;

    lines.push(
      `  <testsuite name="behavior_changes" tests="${diff.behaviorChanges.length}" failures="${behaviorFailures}" errors="0">`
    );

    for (let i = 0; i < diff.behaviorChanges.length; i++) {
      const change = diff.behaviorChanges[i];

      lines.push(
        `    <testcase name="behavior_${i + 1}:${escapeXml(change.tool)}" classname="drift.behavior.${escapeXml(change.aspect)}">`
      );

      if (change.significance === 'high') {
        lines.push(`      <failure message="${escapeXml(change.description)}">`);
        lines.push(`        Before: ${escapeXml(change.before || '(none)')}`);
        lines.push(`        After: ${escapeXml(change.after || '(none)')}`);
        lines.push('      </failure>');
      } else {
        lines.push(`      <system-out>${escapeXml(change.description)}</system-out>`);
      }

      lines.push('    </testcase>');
    }

    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');

  return lines.join('\n');
}
