# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** for this repository. Do not open a public issue containing an exploit, credential, private repository content, or user data.

Include the affected boundary, reproduction steps, expected impact, and the smallest safe proof of concept. We will acknowledge a report as soon as practical, investigate it privately, and coordinate disclosure after a fix is available.

## Supported version

Polyphemus is currently a prototype. Only the deployed `main` revision is supported; there are no stable release branches yet.

## Security boundaries

Repository content is untrusted. Pi runs in an isolated, credential-free worktree and receives only a scoped model grant. Independent validation runs after Pi stops. GitHub App credentials are held by the post-run publisher and are never provided to Pi.

Do not put secrets, private issue content, or personal data in an objective. Public draft pull requests and Git history cannot be reliably erased after publication.
