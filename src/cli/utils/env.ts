/**
 * Detect if running in a CI environment.
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.JENKINS_URL ||
    process.env.TRAVIS ||
    process.env.BUILDKITE
  );
}
