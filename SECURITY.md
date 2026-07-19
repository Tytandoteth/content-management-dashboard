# Security Policy

## Supported versions

Only the `main` branch is supported. Security fixes are not backported to older tags or releases.

## Reporting a vulnerability

There is no formal bug bounty program. If you discover a security vulnerability, please report it privately using GitHub's private vulnerability reporting: go to the **Security** tab of this repository, then **Report a vulnerability**.

Please do not open a public issue for security vulnerabilities. Private reporting lets us investigate and ship a fix before details are public.

## Deployment reminder

`NEXT_PUBLIC_DISABLE_AUTH=true` is a local-development convenience only. It must never be set in a deployed or publicly reachable environment, as it bypasses authentication entirely. See [docs/deployment.md](docs/deployment.md) for details on removing the auth bypass before deploying.
