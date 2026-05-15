// Vitest setup — runs once per test process, BEFORE any test file imports.
//
// Pin deterministic JWT secrets so the dev fallback (random bytes per process)
// doesn't make tests non-reproducible across machines. Real secrets stay in
// the developer's .env or CI's repo secrets; this file is for the test
// environment only.

if (!process.env.JWT_SECRET)           process.env.JWT_SECRET           = 'test-jwt-secret-not-for-prod';
if (!process.env.REFRESH_TOKEN_SECRET) process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-not-for-prod';
if (!process.env.NODE_ENV)             process.env.NODE_ENV             = 'test';
