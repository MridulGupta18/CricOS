import { describe, it, expect } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from './auth';

// These tests exercise the pure helpers — they don't reach the DB or HTTP.
// JWT_SECRET is read at module load; we let the dev fallback kick in (we're
// running in test, not production).

describe('auth helpers — token generation', () => {
  it('issues an access token that round-trips its payload', () => {
    const token = generateAccessToken({ id: 'u1', email: 'a@b.com', role: 'PLAYER' });
    expect(typeof token).toBe('string');
    // JWTs are three dot-separated base64 segments
    expect(token.split('.')).toHaveLength(3);
  });

  it('issues a refresh token that verifies', () => {
    const token = generateRefreshToken({ id: 'u1', tokenVersion: 3 });
    const payload = verifyRefreshToken(token);
    expect(payload.id).toBe('u1');
    expect(payload.tokenVersion).toBe(3);
  });

  it('rejects a tampered refresh token', () => {
    const token = generateRefreshToken({ id: 'u1' });
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => verifyRefreshToken(tampered)).toThrow();
  });
});

describe('auth helpers — hashRefreshToken', () => {
  it('returns a deterministic 64-char hex digest', () => {
    const a = hashRefreshToken('hello world');
    const b = hashRefreshToken('hello world');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different digests for different inputs', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'));
  });
});
