# V2 Rollout Baseline

This branch is for the V2 platform rebuild. Production V1 remains on `main` and is tagged as `v1-stable-20260713`.

## Rules

- Do not merge V2 into `main` until cutover is explicitly approved.
- Keep V2 behind feature flags until a canary test passes.
- Keep existing Google login and Portal sessions working unless a V2 flag is enabled.
- Keep `/post/[id]`, `/my-courses`, and `/api/lms-entry-token` backward compatible during shadow mode.
- Do not store secrets, tokens, raw entry tokens, or private keys in the repository.

## Initial Flags

- `V2_PLATFORM_ENABLED`
- `V2_RUNTIME_MODE`
- `V2_SESSION_LEASE_ENABLED`
- `V2_ENTRY_TOKEN_REQUIRED`
- `V2_RISK_SCORING_ENABLED`

All flags are off by default.

## Portal Scope

The Portal repo owns student login, post pages, my-courses, entry token creation, and the browser-to-LMS handoff.
