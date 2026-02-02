# Bellwether Release Verification Checklist

Run these steps before tagging a release or publishing to npm.

1. Clean install and build
   - `npm ci`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
2. Documentation and man page
   - `npm run docs:generate` (build Docusaurus site in `website/`)
   - `npm run man:generate`
3. Package verification
   - `npm pack --dry-run`
   - `node dist/cli/index.js --help`
4. Optional smoke checks
   - `bellwether init --help`
   - `bellwether check --help`

Notes:
- Ensure `dist/` is up-to-date and `man/` is generated before publishing.
- Verify `action.yml` references a semver tag that matches the npm version.
