import Link from 'next/link';
import { ZH_GLOSSARY, type GlossCategory } from '@/data/glossary.zh';
import { ZH_CATEGORY_LABELS } from '@/data/glossary';
import { ChineseText } from '@/components/ChineseText';
import { ANCHOR_OFFSET } from '@/components/anchorOffset';

export const metadata = {
  title: 'Chinese terms',
  description: 'The Chinese words Kautilya recognises in headlines, with pinyin and why each one matters.',
};

// Sections appear in this order rather than in the order the categories first occur in the
// data file, so adding a term never reshuffles the page.
const ORDER: GlossCategory[] = ['territorial', 'framing', 'military', 'diplomatic', 'economic', 'org'];

export default function ChineseTermsPage() {
  // Grouped from the detector's own list, never from a copy: this is the page's whole promise,
  // and tests/glossary.test.ts fails if a term the engine reads is missing from it.
  const byCategory = new Map<GlossCategory, typeof ZH_GLOSSARY>();
  for (const t of ZH_GLOSSARY) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const sections = ORDER.filter((c) => byCategory.has(c));

  return (
    <div>
      <Link href="/glossary" className="text-[14px] text-muted hover:text-[color:var(--color-accent)]">← Glossary</Link>
      <div className="mt-3 text-[12px] uppercase tracking-[0.22em] text-faint">Glossary</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Chinese terms Kautilya reads</h1>
      <p className="mt-3 max-w-[64ch] text-[17px] leading-relaxed text-muted">
        Kautilya reads Chinese sources in Chinese, so the wording a government chose reaches you
        intact. These {ZH_GLOSSARY.length} terms are the ones it recognises and glosses in headlines. Each
        shows the characters, the pinyin so you can say it aloud, and what it means. Where a
        term carries weight beyond its dictionary meaning, a note says why an analyst should care.
      </p>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-muted">
        The number beside a term is its <em>weight</em>, from 0 to 10: how much its presence adds to
        an event’s escalation score. A higher weight means the word is a stronger signal of a
        hardened position. The escalation ladder — the fixed formulae of official protest — is
        explained in the <Link href="/glossary#ladder" className="text-[color:var(--color-accent)] hover:underline">main glossary</Link>.
      </p>

      <nav aria-label="Chinese term categories" className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[14px]">
        {sections.map((c) => (
          <a key={c} href={`#${c}`} className="text-muted hover:text-[color:var(--color-accent)]">
            {ZH_CATEGORY_LABELS[c].label}
          </a>
        ))}
      </nav>

      {sections.map((c) => (
        <section key={c} id={c} aria-labelledby={`${c}-h`} className={ANCHOR_OFFSET}>
          <h2 id={`${c}-h`} className="mt-10 mb-1 text-[19px] font-semibold tracking-tight text-text">
            {ZH_CATEGORY_LABELS[c].label}
          </h2>
          <p className="mb-3 max-w-[64ch] text-[15px] leading-relaxed text-muted">{ZH_CATEGORY_LABELS[c].blurb}</p>
          <dl>
            {byCategory.get(c)!.map((t) => (
              <div key={t.zh} className="grid gap-x-6 gap-y-1 border-t border-[color:var(--color-line)] py-3 sm:grid-cols-[14rem_1fr]">
                <dt className="text-[17px] text-text">
                  <ChineseText text={t.zh} size="small" accent clamp={false} />
                </dt>
                <dd className="max-w-[64ch] text-[15px] leading-relaxed text-muted">
                  <span className="text-text">{t.en}</span>
                  {t.weight != null && (
                    <span className="ml-2 mono-num text-[13px] text-faint">weight {t.weight}</span>
                  )}
                  {t.note && <span className="mt-1 block">{t.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
