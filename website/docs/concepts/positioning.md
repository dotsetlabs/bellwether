---
title: What Bellwether Is (and Isn't)
sidebar_position: 6
---

# What Bellwether Is (and Isn't)

Understanding where Bellwether fits in your development workflow.

## Bellwether IS:

- **Behavioral documentation tool**: Discovers and documents what your MCP server actually does by testing it
- **Drift detection system**: Compares baseline behaviors to catch unexpected changes between versions
- **Multi-perspective testing**: 4 personas (Technical Writer, Security, QA, Novice) surface different types of issues
- **CI/CD integration**: Designed to run in pipelines with exit codes for deployment gating
- **Security hygiene checker**: Catches common issues like path traversal, injection patterns, and info disclosure

## Bellwether IS NOT:

- **A replacement for unit tests**: Use both. Unit tests verify expected behavior, Bellwether discovers unexpected behavior.
- **A security certification**: Platinum badges indicate testing coverage, not professional security audits
- **A substitute for code review**: Bellwether tests behavior, not code quality
- **Enterprise software**: Built for individuals and small teams, not large organizations with SSO/SAML requirements

## Bellwether vs. Traditional Testing

| Approach | What it catches | What it misses |
|:---------|:----------------|:---------------|
| **Unit tests** | Regressions in expected behavior | Behaviors you didn't think to test |
| **Integration tests** | System-level failures | Edge cases in tool interactions |
| **Manual testing** | Issues you look for | Issues you don't know to look for |
| **Bellwether** | Unexpected behaviors across 4 personas | (Use with above for complete coverage) |

**Key insight**: Unit tests verify YOUR expectations. Bellwether discovers UNEXPECTED behaviors.

Think of the difference:
- **Unit test**: "Does `get_weather('NYC')` return weather data?"
- **Bellwether**: "What happens when someone calls `get_weather` with a SQL injection string?"

They're complementary. Use both.

## When to Use Bellwether

| Scenario | Bellwether helps? | Notes |
|:---------|:------------------|:------|
| Building an MCP server | ✅ Yes | Document behavior as you develop |
| Adopting a third-party MCP server | ✅ Yes | Verify behavior before trusting |
| CI/CD pipeline gating | ✅ Yes | Use `--fail-on-drift` for deployment gates |
| Security compliance audits | ⚠️ Partial | Good first step, not sufficient alone |
| Enterprise-wide rollout | ❌ Not ideal | No SSO, limited team features |

## Understanding Documentation Badges

"Documented by Bellwether" means **systematically documented with Bellwether**, not independently certified. Badges indicate:

- The server was interviewed with Bellwether
- It achieved the specified documentation coverage tier
- Results are self-reported by the server maintainer

### What Each Tier Means

| Tier | Requirements | What it signals |
|:-----|:-------------|:----------------|
| 🥉 Bronze | Basic documentation (happy path) | "This server has been documented" |
| 🥈 Silver | + Error handling coverage | "This server handles errors gracefully" |
| 🥇 Gold | + All personas, good coverage | "This server is thoroughly documented" |
| 💎 Platinum | + Comprehensive testing, all personas | "This server has thorough documentation coverage" |

**Important**: Platinum documentation indicates comprehensive coverage across all testing personas. Security hygiene checks are included but this is a first line of defense—not a replacement for professional security audits.

Verification is valid for 90 days and should be re-run after significant changes.

## Complementary Tools

Bellwether works best alongside:

- **Unit testing frameworks** (Jest, Vitest, pytest): Test expected behavior
- **Security scanners** (Snyk, Dependabot): Dependency vulnerabilities
- **Professional security audits**: For high-sensitivity systems
- **API documentation tools** (OpenAPI): Schema documentation

## Sustainability & Business Model

Bellwether is built by [Dotset Labs](https://dotsetlabs.com), a bootstrapped software company.

**Three things make Bellwether sustainable:**

1. **MIT Licensed CLI**: The core tool is fully open source. If the project is ever abandoned, the code is yours to fork and maintain.

2. **Simple Business Model**: Free CLI for adoption, $29/mo team plan for cloud costs. No VC pressure, no growth-at-all-costs.

3. **Community Building**: Contributions welcome. The goal is community-maintained infrastructure, not a one-person dependency.

The CLI works entirely offline. Cloud features are optional conveniences, not lock-in.
