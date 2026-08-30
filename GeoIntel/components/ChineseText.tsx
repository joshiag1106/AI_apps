import type { ReactNode } from 'react';
import { toPinyin, pickEnglish } from '@/lib/lang/pinyin';

/**
 * Chinese text with its romanisation and meaning underneath.
 *
 * The site deliberately shows headlines in the language they were published in — that is
 * the whole point of reading PRC sources directly rather than through a wire summary.
 * But an English-reading analyst gets nothing from a line of Han characters. Pinyin
 * supplies the sound, so the reader can say the name of a place or a formula out loud and
 * match it to what they already know; the English line supplies the sense.
 *
 * Text with no Chinese in it renders untouched, so call sites can wrap a headline without
 * first checking what language it is in.
 */
export function ChineseText({
  text, english, className, size = 'normal', accent = false, clamp = true,
  englishIsGloss = false,
}: {
  text: string;
  /**
   * Best available English. A real translation if one exists, otherwise the gloss.
   * Omit where the caller already shows the meaning nearby — the ladder views print
   * `ladderEn` in their own column, and a second copy underneath is just noise.
   */
  english?: string | null;
  className?: string;
  /** 'small' for dense contexts such as a ladder chip. */
  size?: 'normal' | 'small';
  /**
   * Apply the site's Chinese treatment (face and accent colour) to the Han line. On by
   * default nowhere: headlines keep the colour of the heading they sit in, while the
   * ladder chips that already used `zh-text` opt back into it.
   */
  accent?: boolean;
  /** Clamp each line to two rows. Off for short strings such as a ladder formula. */
  clamp?: boolean;
  /**
   * Whether `english` is the keyword gloss rather than a real translation.
   *
   * The two are not the same thing and the site has always said so: a gloss is the
   * recognised terms strung together — "China · announce" — and presenting that as a
   * translation would overclaim. Labelled ones are marked; real translations stand alone.
   */
  englishIsGloss?: boolean;
}) {
  const py = toPinyin(text);
  if (!py) return <>{text}</>;

  const en = pickEnglish(english);
  const sub = size === 'small' ? 'text-[10px]' : 'text-[11px]';
  // Clamping is per line, not on the wrapper: clamping the stack would cut the English
  // off to make room for the pinyin, which defeats the point of showing both.
  const cut = clamp ? 'line-clamp-2' : '';

  return (
    <span className={className}>
      <span lang="zh" className={`block ${accent ? 'zh-text' : ''} ${cut}`}>{text}</span>
      {/* zh-Latn tells a screen reader to read this as romanised Chinese rather than
          attempting it as English. */}
      <span lang="zh-Latn" className={`mt-0.5 block ${sub} italic text-faint ${cut}`}>{py}</span>
      {en && (
        <span lang="en" className={`mt-0.5 block ${sub} text-muted ${cut}`}>
          {englishIsGloss ? <span className="italic text-faint">Glossed: </span> : null}{en}
        </span>
      )}
    </span>
  );
}

/**
 * The same information as a `title` attribute, for one-line contexts.
 *
 * Dense rows — the live feed, the ladder column of a table — are deliberately single
 * lines. Stacking three lines into them would triple their height and destroy the
 * scannability that is the reason those views exist, so there the romanisation and
 * meaning are carried on hover instead. Returns undefined when there is no Chinese, so
 * the attribute is omitted rather than rendered empty.
 */
export function chineseTitle(text: string, english?: string | null): string | undefined {
  const py = toPinyin(text);
  if (!py) return undefined;
  const en = pickEnglish(english);
  return en ? `${py} — ${en}` : py;
}

/**
 * Pre-rendered annotated titles, keyed by event id, for handing to a client component.
 *
 * `pinyin-pro` carries the Han-to-pinyin dictionaries, so importing it into a client
 * bundle would ship them to every visitor for the sake of a few headlines. Server
 * components can pass already-rendered elements across the boundary instead, which keeps
 * the dictionaries on the server and the client bundle unchanged.
 *
 * The English resolver is a parameter rather than an import so this module stays free of
 * any dependency on the scoring layer.
 */
export function zhTitleMap(
  events: { id: string; title: string }[],
  english: (title: string) => string | null,
): Record<string, ReactNode> {
  return Object.fromEntries(events.map((e) => [
    e.id,
    <ChineseText key={e.id} text={e.title} english={english(e.title)} englishIsGloss />,
  ]));
}
