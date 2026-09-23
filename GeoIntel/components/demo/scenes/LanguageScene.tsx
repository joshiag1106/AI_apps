// components/demo/scenes/LanguageScene.tsx
import { toPinyin } from '@/lib/lang/pinyin';
import type { LanguageData } from '@/lib/demo/types';
import { Beat, SceneFrame, beatStyle } from './Beat';

/** The pinyin reveal gets this long in total, so a long headline speeds up instead of overrunning. */
export const PINYIN_MS = 3400;

export function pinyinStep(count: number): number {
  return Math.min(90, Math.floor(PINYIN_MS / Math.max(1, count)));
}

/**
 * Chapter 2. A Chinese headline, its pinyin arriving syllable by syllable, then the ladder formula
 * inside it highlighted and resolved to its curated English meaning.
 *
 * It deliberately does NOT show the stored word-by-word English gloss (`glossed` / `title_en`): that
 * is a dictionary join, not a translation, and animating "surname Xiao · the Americas · guqin" would
 * oversell it. Pinyin and the curated formula meaning are accurate.
 *
 * `toPinyin` returns space-separated syllables, so the reveal is per syllable; grouping them into
 * words would be a second guess.
 */
export function LanguageScene({ data }: { data: LanguageData }) {
  const at = data.headline.indexOf(data.ladderZh);
  const found = at >= 0 && data.ladderZh.length > 0;
  const before = found ? data.headline.slice(0, at) : data.headline;
  const after = found ? data.headline.slice(at + data.ladderZh.length) : '';

  const syllables = toPinyin(data.headline).split(' ').filter(Boolean);
  const step = pinyinStep(syllables.length);

  return (
    <SceneFrame>
      <Beat at={0} className="text-[13px] text-faint">{`${data.outlet} · ${data.date}`}</Beat>

      <Beat at={250} className="max-w-3xl text-center">
        <p lang="zh" className="zh-text text-[28px] leading-snug sm:text-[34px]">
          {before}
          {found && <mark className="demo-mark" style={beatStyle(4900)}>{data.ladderZh}</mark>}
          {after}
        </p>
      </Beat>

      <p lang="zh-Latn" className="flex max-w-3xl flex-wrap justify-center gap-x-2 text-[18px] text-muted">
        {syllables.map((s, i) => (
          <span key={i} className="demo-beat" style={beatStyle(1000 + i * step)}>{s}</span>
        ))}
      </p>

      <Beat at={5800} className="text-center">
        <div lang="zh" className="zh-text text-2xl">{data.ladderZh}</div>
        <div lang="zh-Latn" className="text-[13px] text-faint">{toPinyin(data.ladderZh)}</div>
        <div className="mt-1 text-[17px] text-text">{data.ladderEn}</div>
        <div className="mono-num mt-1 text-[13px] text-faint">{`rung ${data.rung} of 13`}</div>
      </Beat>
    </SceneFrame>
  );
}
