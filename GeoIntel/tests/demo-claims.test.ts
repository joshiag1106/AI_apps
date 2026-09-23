// tests/demo-claims.test.ts
import { describe, it, expect } from 'vitest';
import { METERED } from '@/lib/quota';
import { CHAPTER_ACTION, EXPORT_ACTION, chipFor, exportChipFor, closingFor } from '@/lib/demo/claims';
import { CHAPTER_IDS } from '@/lib/demo/types';

describe('chips', () => {
  it('only ever name a metered action that exists', () => {
    for (const action of [...Object.values(CHAPTER_ACTION), EXPORT_ACTION]) {
      expect(Object.keys(METERED), String(action)).toContain(action);
    }
  });

  it('only ever attach to a real chapter', () => {
    for (const id of Object.keys(CHAPTER_ACTION)) expect(CHAPTER_IDS as readonly string[]).toContain(id);
  });

  it('are absent while nothing is enforced — the preview period sells nothing', () => {
    for (const id of CHAPTER_IDS) {
      if (id === 'yours') continue;
      expect(chipFor(id, false), id).toBeNull();
    }
    expect(exportChipFor(false)).toBeNull();
  });

  it('appear on metered chapters once enforcement is on', () => {
    expect(chipFor('event', true)).toBe('Desk');
    expect(chipFor('dyad', true)).toBe('Desk');
    expect(chipFor('network', true)).toBe('Desk');
    expect(chipFor('board', true)).toBeNull();
    expect(chipFor('ask', true)).toBeNull();
    expect(exportChipFor(true)).toBe('Desk');
  });

  it('are unconditional for alerts, because alerts are gated on the plan and not on the switch', () => {
    expect(chipFor('yours', false)).toBe('Desk Pro');
    expect(chipFor('yours', true)).toBe('Desk Pro');
  });
});

describe('the closing chapter', () => {
  const closed = { mode: 'closed' as const, freeLimit: 5 };
  const open = { mode: 'stripe' as const, freeLimit: 5 };

  it('preview, billing closed: names what is open, says alerts are Desk Pro and not open yet, one button', () => {
    const c = closingFor({ enforced: false, ...closed });
    expect(c.copy).toBe(
      'The board, the event and analysis views, the network and Ask are open while Kautilya is in preview. '
      + 'Email alerts are part of Desk Pro, which is not open yet.');
    expect(c.buttons).toEqual([{ label: 'Enter the threat board', href: '/board', primary: true }]);
  });

  it('preview, billing open: same, without "not open yet", and offers the plans', () => {
    const c = closingFor({ enforced: false, ...open });
    expect(c.copy).toBe(
      'The board, the event and analysis views, the network and Ask are open while Kautilya is in preview. '
      + 'Email alerts are part of Desk Pro.');
    expect(c.buttons.map((b) => b.href)).toEqual(['/board', '/pricing']);
  });

  it('enforced, billing closed: the free allowance, and that subscriptions are not open', () => {
    const c = closingFor({ enforced: true, ...closed });
    expect(c.copy).toBe('5 free analyses, then Desk Pro — subscriptions are not open yet.');
    expect(c.buttons).toHaveLength(1);
  });

  it('enforced, billing open: the free allowance and the plans', () => {
    const c = closingFor({ enforced: true, ...open });
    expect(c.copy).toBe('5 free analyses, then Desk Pro.');
    expect(c.buttons.map((b) => b.label)).toEqual(['Enter the threat board', 'See plans']);
    expect(c.buttons[1].primary).toBe(false);
  });

  it('reads the allowance from the state, never from a literal', () => {
    expect(closingFor({ enforced: true, mode: 'mock', freeLimit: 12 }).copy).toContain('12 free analyses');
  });

  it('prints no number and no price while nothing is enforced', () => {
    for (const mode of ['closed', 'stripe', 'mock'] as const) {
      const { copy } = closingFor({ enforced: false, mode, freeLimit: 5 });
      expect(copy).not.toMatch(/\d|₹|\$/);
    }
  });
});
