import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-sec-')), 'test.db');

import { safeRedirect, loginErrorMessage } from '@/lib/security/redirect';
import { isThrottled, recordFailure, clearFailures } from '@/lib/security/throttle';

describe('post-login redirect', () => {
  it('allows same-site paths', () => {
    expect(safeRedirect('/account')).toBe('/account');
    expect(safeRedirect('/dyad/IND-CHN')).toBe('/dyad/IND-CHN');
    expect(safeRedirect('/events?lang=zh')).toBe('/events?lang=zh');
  });

  it('refuses to send the user off-site after a genuine login', () => {
    const offsite = [
      'https://evil.example.com/steal',
      'http://evil.example.com',
      '//evil.example.com',
      '/\\evil.example.com',
      '\\\\evil.example.com',
      'javascript:alert(1)',
      '/%2f%2fevil.example.com',
      '/\tevil',
    ];
    for (const t of offsite) expect(safeRedirect(t)).toBe('/account');
  });

  it('falls back on anything that is not a usable string', () => {
    expect(safeRedirect(undefined)).toBe('/account');
    expect(safeRedirect(null)).toBe('/account');
    expect(safeRedirect('')).toBe('/account');
    expect(safeRedirect(42)).toBe('/account');
    expect(safeRedirect('relative/path')).toBe('/account');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeRedirect('https://evil.example', '/pricing')).toBe('/pricing');
  });
});

describe('login error messages', () => {
  it('renders only known codes, never free text from the URL', () => {
    expect(loginErrorMessage('bad_credentials')).toBe('Email or password is incorrect.');
    // An attacker cannot place their own copy inside a genuine page.
    expect(loginErrorMessage('Your session expired — call +1-555-0100 to restore it')).toBeNull();
    expect(loginErrorMessage('<img src=x onerror=alert(1)>')).toBeNull();
    expect(loginErrorMessage(undefined)).toBeNull();
  });
});

describe('failed-login throttle', () => {
  const who = 'probe@example.test';
  beforeAll(() => clearFailures(who));

  it('allows a person who mistypes, and stops a script working a list', () => {
    for (let i = 0; i < 3; i++) {
      expect(isThrottled(who)).toBe(false);
      recordFailure(who);
    }
    // Still fine after a few genuine mistakes.
    expect(isThrottled(who)).toBe(false);

    for (let i = 0; i < 5; i++) recordFailure(who);
    expect(isThrottled(who)).toBe(true);
  });

  it('is keyed per account, so one target cannot lock out another', () => {
    expect(isThrottled('someone-else@example.test')).toBe(false);
  });

  it('clears on a successful sign-in', () => {
    clearFailures(who);
    expect(isThrottled(who)).toBe(false);
  });

  it('expires so a locked-out user is not blocked forever', () => {
    for (let i = 0; i < 9; i++) recordFailure(who);
    expect(isThrottled(who)).toBe(true);
    expect(isThrottled(who, Date.now() + 16 * 60 * 1000)).toBe(false);
    clearFailures(who);
  });
});

/**
 * Contrast is a correctness property here, not a style preference: risk level is the
 * primary information this product carries, and it is carried largely in colour.
 */
describe('palette contrast (WCAG AA)', () => {
  const luminance = (hex: string) => {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4]
      .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // Every surface text can sit on.
  const backgrounds = ['#111825', '#070a0f', '#0c1119', '#161f2e'];
  const textColours: Record<string, string> = {
    text: '#e8eef6', muted: '#8c9bb0', faint: '#7b8a9e', accent: '#e8b339',
    low: '#2ea043', guarded: '#c9a227', elevated: '#e08c3c', high: '#ef5350',
    severe: '#f2645f', zh: '#ff8f7a', verified: '#3fb6a8',
  };

  it('every text colour clears 4.5:1 on every background it can appear on', () => {
    for (const [name, colour] of Object.entries(textColours)) {
      const worst = Math.min(...backgrounds.map((bg) => ratio(colour, bg)));
      expect(worst, `${name} (${colour}) worst contrast ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the deep alarm red available for fills, which carry no text', () => {
    // Documented as fill-only precisely because it does not meet the text threshold.
    expect(ratio('#c62828', '#111825')).toBeLessThan(4.5);
  });
});
