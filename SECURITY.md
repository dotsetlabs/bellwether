# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | Yes                |
| < 1.0   | No                 |

## Reporting a Vulnerability

We take security seriously. If you discover a security issue, please report it responsibly.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email us at: security@dotsetlabs.com

### What to include

- Description of the issue
- Steps to reproduce (if applicable)
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Resolution target**: Depends on severity

### What to Expect

1. We will acknowledge receipt of your report
2. We will investigate and validate the issue
3. We will work on a fix and coordinate disclosure timing with you
4. We will credit you in the release notes (unless you prefer to remain anonymous)

## Security Best Practices for Users

When using Bellwether:

- Keep the CLI updated to the latest version
- Store API keys securely (use `bellwether auth` for keychain storage)
- Review MCP server code before testing in production environments
- Use environment variables for sensitive configuration values

## Scope

This policy applies to the Bellwether CLI (`@dotsetlabs/bellwether` npm package).

Thank you for helping keep Bellwether secure.
