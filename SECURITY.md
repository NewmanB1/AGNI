# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in AGNI, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email **security@agni-project.org** (or open a [private security advisory](https://github.com/NewmanB1/AGNI/security/advisories/new) on GitHub).
3. Include:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge your report within **48 hours** and aim to provide a fix or mitigation within **7 days** for critical issues.

## Security Considerations

AGNI is designed for **offline-first village hub deployments** on local networks. The threat model assumes:

- The hub runs on a private LAN (e.g., school Wi-Fi or Raspberry Pi hotspot).
- Physical access to the hub device implies trust.
- Internet connectivity is intermittent or absent.

However, we still follow security best practices:

- **Creator passwords** are hashed with scrypt (64-byte key, random salt).
- **Session tokens** are cryptographically random (32 bytes).
- **Lesson integrity** is verified via Ed25519 signatures.
- **Sync packages** re-pseudonymize student identifiers before transmission.
- **Input validation** is enforced on lesson content via JSON Schema (Ajv).

## Known Limitations

- Student PINs are short numeric codes designed for shared-device convenience, not high-security authentication.
- CORS is configured permissively (`*`) for local network compatibility.
- The hub is not designed for direct internet exposure without a reverse proxy.
