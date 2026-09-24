// tests/demo-scenes-lens.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LensScene } from '@/components/demo/scenes/LensScene';
import { selectLens } from '@/lib/demo/select';
import { lensTopic, richInput } from './fixtures/demo-fixtures';

const beatsOf = (out: string) => [...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));

describe('the Language Lens scene', () => {
  const data = selectLens(richInput())!;
  const out = renderToStaticMarkup(createElement(LensScene, { data }));

  it('names the topic and both languages, the one that frames it more first', () => {
    expect(out).toContain('India–Pakistan');
    expect(out.indexOf('Chinese')).toBeGreaterThan(-1);
    expect(out.indexOf('Chinese')).toBeLessThan(out.indexOf('Hindi'));
  });

  it('says how many reports each side is read from', () => {
    expect(out).toContain('200 reports');
  });

  it('shows what each language was asked, in its own script, with the English', () => {
    expect(out).toContain('lang="zh"');
    expect(out).toContain('印巴冲突');
    expect(out).toContain('India Pakistan conflict');
  });

  it('draws each framing as a bar and marks the one that differs', () => {
    expect(out).toContain('width:95%');
    expect(out).toContain('width:25%');
    expect((out.match(/data-differs="true"/g) ?? []).length).toBe(2);
  });

  it('shows each side\'s newest headline in its own language', () => {
    expect(out).toContain('印巴边境局势紧张');
    expect(out).toContain('lang="hi"');
  });

  it('states the difference in the Lens page\'s own words, after both sides are on screen', () => {
    expect(out).toContain(data.sentence);
    const beats = beatsOf(out);
    expect(beats[beats.length - 1]).toBeGreaterThan(Math.max(...beats.slice(0, -1)));
  });

  it('says it is Kautilya\'s sample, not a country\'s whole press', () => {
    expect(out).toMatch(/sample/i);
  });

  it('shows no headline block for a side that has none', () => {
    const t = lensTopic();
    const none = selectLens(richInput({ lens: [{ ...t, columns: t.columns.map((c) => ({ ...c, latest: [] })) }] }))!;
    const html = renderToStaticMarkup(createElement(LensScene, { data: none }));
    expect(html).not.toContain('印巴边境局势紧张');
    expect(html).not.toMatch(/Latest/);
  });
});
