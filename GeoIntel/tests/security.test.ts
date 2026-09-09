import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
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

  /*
   * Read from the stylesheet rather than copied into this file. A duplicated palette is a
   * palette that drifts: the same shape of bug shipped in this product when the roster's
   * review date was typed into the page copy as well as the data, and the page spent a day
   * telling readers a date its own source disagreed with. A test asserting colours that no
   * longer exist would be worse — it would report contrast compliance for a palette nobody
   * sees.
   */
  const cssSource = readFileSync('app/globals.css', 'utf8');
  // Tailwind v4 declares the base tokens in @theme, not :root; the palette overrides below
  // it use :root[data-palette=...], so slicing to the first '}' keeps them out.
  const themeStart = cssSource.indexOf('@theme {');
  const rootBlock = cssSource.slice(themeStart, cssSource.indexOf('\n}', themeStart));
  const tokenOf = (name: string) => {
    const m = rootBlock.match(new RegExp(`--color-${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    expect(m, `--color-${name} is not defined in :root`).not.toBeNull();
    return m![1];
  };
  const textColours: Record<string, string> = Object.fromEntries(
    ['text', 'muted', 'faint', 'accent', 'low', 'guarded', 'elevated', 'high', 'severe', 'zh', 'verified']
      .map((n) => [n, tokenOf(n)]),
  );

  it('every text colour clears 4.5:1 on every background it can appear on', () => {
    for (const [name, colour] of Object.entries(textColours)) {
      const worst = Math.min(...backgrounds.map((bg) => ratio(colour, bg)));
      expect(worst, `${name} (${colour}) worst contrast ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /*
   * The alternate palettes, read from the stylesheet that actually ships rather than from a
   * copy in TypeScript — the CSS is the artefact a reader sees, and a duplicate here would
   * be one more thing to drift.
   *
   * These properties all fail SILENTLY in a browser, which is why they are pinned:
   * a missing token inherits the default and produces a mixed scheme; two steps at the same
   * luminance merge in greyscale; a non-monotonic ramp stops reading as a scale at all; and
   * a ramp even in LINEAR luminance is uneven to a reader, which is the one that got past
   * this file once already.
   *
   * Hue separation is deliberately NOT asserted here. The palettes encode severity in
   * luminance on purpose (see the note in globals.css: >=4.5:1 contrast plus wide monotonic
   * luminance forces the upper steps pale, and pale sRGB has no chroma left to separate by
   * hue). Re-implementing OKLab CVD simulation in a unit test would be a second version of
   * the thing being trusted; those numbers were computed once with the dataviz validator
   * and recorded in the stylesheet.
   */
  describe('alternate palettes', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    const RAMP = ['--color-low', '--color-guarded', '--color-elevated', '--color-high', '--color-severe'];
    const PALETTES = ['accessible', 'monochrome'];

    const block = (name: string) => {
      const at = css.indexOf(`:root[data-palette="${name}"]`);
      expect(at, `palette "${name}" is missing from globals.css`).toBeGreaterThan(-1);
      const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
      const out = new Map<string, string>();
      for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out.set(m[1], m[2]);
      return out;
    };

    it('defines every severity token, so none silently inherits the default', () => {
      // The failure this catches is not an error but a MIXTURE: an unset token keeps the
      // original red while its neighbours change, and that odd step reads to the eye as a
      // meaningful severity band rather than as an oversight.
      for (const name of PALETTES) {
        for (const token of RAMP) {
          expect(block(name).has(token), `palette "${name}" is missing ${token}`).toBe(true);
        }
      }
    });

    it('orders severity monotonically by luminance, so the ramp reads as a scale', () => {
      for (const name of PALETTES) {
        const lums = RAMP.map((t) => luminance(block(name).get(t)!));
        expect(lums, `palette "${name}" is not monotonic`).toEqual([...lums].sort((a, b) => a - b));
      }
    });

    it('separates every pair in greyscale, so severity survives losing colour entirely', () => {
      // 0.06 of relative luminance is the floor. Below it two bands merge when printed in
      // black and white, projected badly, or read by someone with achromatopsia — for whom
      // no amount of hue engineering does anything at all.
      for (const name of PALETTES) {
        const lums = RAMP.map((t) => luminance(block(name).get(t)!));
        for (let i = 0; i < lums.length; i++) {
          for (let j = i + 1; j < lums.length; j++) {
            expect(Math.abs(lums[i] - lums[j]),
              `${name}: ${RAMP[i]} and ${RAMP[j]} merge in greyscale`).toBeGreaterThan(0.06);
          }
        }
      }
    });

    /*
     * OKLab's lightness channel. Forward transform only — this is arithmetic on a colour,
     * not the CVD simulation the note above declines to reimplement, and there is no way
     * to ask the question without it.
     */
    const okLightness = (hex: string) => {
      const n = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    };

    it('spaces the ramp evenly in PERCEPTUAL lightness, not merely in linear luminance', () => {
      /*
       * The greyscale test above measures WCAG relative luminance. That is the right
       * question for "does this survive a black-and-white printer" and the WRONG one for
       * "can a reader tell two adjacent bands apart", because relative luminance is linear
       * and perceived lightness is roughly its cube root.
       *
       * Both ramps were once spaced evenly in the linear quantity — about 0.17 a step,
       * which this file measured and passed — while the perceptual step fell from 0.109 at
       * the dark end to 0.060 between `high` and `severe`. Separation shrank as severity
       * ROSE, in the two palettes whose whole purpose is to carry severity in luminance.
       * The test agreed the ramp was even the entire time.
       *
       * 0.08 is the floor because that is what even spacing yields across the lightness
       * range the 4.5:1 contrast floor leaves available. Falling under it means the steps
       * have gone uneven again, not that the range ran out.
       */
      for (const name of PALETTES) {
        const ls = RAMP.map((t) => okLightness(block(name).get(t)!));
        for (let i = 0; i < ls.length - 1; i++) {
          const gap = ls[i + 1] - ls[i];
          expect(gap, `${name}: ${RAMP[i]} and ${RAMP[i + 1]} are ${gap.toFixed(3)} apart perceptually`)
            .toBeGreaterThanOrEqual(0.08);
        }
      }
    });

    it('clears 4.5:1 on every surface, to the same standard as the default palette', () => {
      // An accessibility palette that failed the product's own contrast bar would be worse
      // than useless — it would look like diligence while reading worse.
      for (const name of PALETTES) {
        for (const token of RAMP) {
          const colour = block(name).get(token)!;
          const worst = Math.min(...backgrounds.map((bg) => ratio(colour, bg)));
          expect(worst, `${name} ${token} (${colour}) worst ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('keeps the de-escalatory overlay clear of the friction lines it crosses', () => {
      // NetworkGraph draws friction in --color-severe and the overlay in --color-verified
      // over the same region; if a palette brings them together the overlay stops being a
      // separate signal.
      for (const name of PALETTES) {
        const b = block(name);
        expect(Math.abs(luminance(b.get('--color-severe')!) - luminance(b.get('--color-verified')!)),
          `${name}: overlay and friction merge`).toBeGreaterThan(0.06);
      }
    });
  });

  it('keeps the deep alarm red available for fills, which carry no text', () => {
    // Documented as fill-only precisely because it does not meet the text threshold.
    expect(ratio('#c62828', '#111825')).toBeLessThan(4.5);
  });
});
