import fs from 'fs';

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

const diff = report.metadata?.diff || {};
const behaviorChanges = Array.isArray(diff.behaviorChanges) ? diff.behaviorChanges : [];
const toolCount = Array.isArray(report.toolProfiles) ? report.toolProfiles.length : 0;
const failures = Number(diff.breakingCount || 0);
const tests = Math.max(toolCount, 1);

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += `<testsuites name="Bellwether MCP Check" tests="${tests}" failures="${failures}" errors="0">\n`;
xml += `  <testsuite name="Schema Drift Detection" tests="${tests}" failures="${failures}" errors="0">\n`;

if (behaviorChanges.length > 0) {
  for (const change of behaviorChanges) {
    if (change.severity === 'breaking') {
      xml += `    <testcase name="${escapeXml(change.tool)}: ${escapeXml(change.aspect)}">\n`;
      xml += `      <failure message="${escapeXml(change.description)}">${escapeXml(change.before)} -> ${escapeXml(change.after)}</failure>\n`;
      xml += '    </testcase>\n';
    } else {
      xml += `    <testcase name="${escapeXml(change.tool)}: ${escapeXml(change.aspect)}"/>\n`;
    }
  }
} else {
  xml += '    <testcase name="No changes detected"/>\n';
}

xml += '  </testsuite>\n';
xml += '</testsuites>\n';

console.log(xml);
