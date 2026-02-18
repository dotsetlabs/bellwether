import fs from 'fs';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const reportPath = process.argv[2];
if (!reportPath) {
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch {
  process.exit(1);
}

const toolProfiles = asArray(report.toolProfiles);
const tools = asArray(report.capabilities?.tools);
const behaviorChanges = asArray(report.metadata?.diff?.behaviorChanges);

const toolCount = toolProfiles.length;
const docScore = report.metadata?.documentationScore?.overall ?? '';
const securityFindings = tools.reduce(
  (sum, tool) => sum + asArray(tool?.securityFingerprint?.findings).length,
  0
);
const breakingCount = Number(report.metadata?.diff?.breakingCount ?? 0);
const warningCount = Number(report.metadata?.diff?.warningCount ?? 0);
const infoCount = Number(report.metadata?.diff?.infoCount ?? 0);
const behaviorChangeCount = behaviorChanges.length;

console.log(
  [
    String(toolCount),
    String(docScore),
    String(securityFindings),
    String(breakingCount),
    String(warningCount),
    String(infoCount),
    String(behaviorChangeCount),
  ].join('|')
);
