# Security Policy

Somakine treats data packs and 3D assets as untrusted input.

Please report vulnerabilities privately to the maintainers before opening a
public issue. Until a dedicated security address exists, use a private GitHub
security advisory on the canonical repository.

Supported security guarantees for the alpha:

- schemas reject unsafe relative paths and unregistered asset references;
- default browser loading rejects redirects, assets over 128 MiB, oversized
  response bodies, byte-count and SHA-256 mismatches, credentialed requests,
  malformed GLB containers, and any URI embedded inside a GLB;
- the framework never renders data-pack strings as HTML;
- no telemetry, accounts, health questions, or personal data are collected;
- dependency and published-package contents are reviewed before release.

The alpha is not approved for safety-critical or clinical use.
