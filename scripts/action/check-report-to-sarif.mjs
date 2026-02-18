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

const sarif = {
  $schema:
    'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'Bellwether',
          version: report.metadata?.version || '1.0.0',
          informationUri: 'https://github.com/dotsetlabs/bellwether',
          rules: [],
        },
      },
      results: [],
    },
  ],
};

const run = sarif.runs[0];
const behaviorChanges = Array.isArray(report.metadata?.diff?.behaviorChanges)
  ? report.metadata.diff.behaviorChanges
  : [];

for (const change of behaviorChanges) {
  const level =
    change.severity === 'breaking' ? 'error' : change.severity === 'warning' ? 'warning' : 'note';
  run.results.push({
    ruleId: `bellwether/${change.aspect}`,
    level,
    message: { text: change.description || `${change.aspect} changed` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'bellwether-baseline.json' },
          region: { startLine: 1 },
        },
      },
    ],
  });
}

console.log(JSON.stringify(sarif, null, 2));
