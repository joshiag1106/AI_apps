import Link from 'next/link';
import { ABBREVIATIONS, CONCEPT_GROUPS, NETWORK_MEASURES, type GlossEntry } from '@/data/glossary';
import { ESCALATION_LADDER, ZH_GLOSSARY } from '@/data/glossary.zh';
import { ChineseText } from '@/components/ChineseText';
import { Panel } from '@/components/ui';
import { ANCHOR_OFFSET } from '@/components/anchorOffset';

export const metadata = {
  title: 'Glossary',
  description: 'The abbreviations and vocabulary used across Kautilya, in plain language.',
};

/**
 * One term. The id is the deep link (/glossary#lac), so a definition can be pointed at from
 * anywhere. ANCHOR_OFFSET keeps the target clear of the sticky header when the browser jumps
 * to it — without it the term lands underneath the menu.
 */
function Entry({ e }: { e: GlossEntry }) {
  return (
    <div id={e.id} className={`${ANCHOR_OFFSET} break-inside-avoid border-t border-[color:var(--color-line)] py-3`}>
      <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <a href={`#${e.id}`} className="text-[15px] font-semibold tracking-tight text-text hover:text-[color:var(--color-accent)]">
          {e.term}
        </a>
        {e.expansion && <span className="text-[14px] text-faint">{e.expansion}</span>}
        {e.aka && <span className="text-[13px] italic text-faint">also called {e.aka}</span>}
      </dt>
      <dd className="mt-1 max-w-[64ch] text-[15px] leading-relaxed text-muted">{e.meaning}</dd>
    </div>
  );
}

function Section({ id, title, intro, children }: {
  id: string; title: string; intro?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={ANCHOR_OFFSET}>
      <h2 id={`${id}-h`} className="mt-10 mb-1 text-[19px] font-semibold tracking-tight text-text">{title}</h2>
      {intro && <p className="mb-3 max-w-[64ch] text-[15px] leading-relaxed text-muted">{intro}</p>}
      {children}
    </section>
  );
}

function Terms({ entries }: { entries: GlossEntry[] }) {
  return (
    <dl className="lg:columns-2 lg:gap-x-12">
      {entries.map((e) => <Entry key={e.id} e={e} />)}
    </dl>
  );
}

export default function GlossaryPage() {
  // Every jump link is built from the same data the sections render, so a section cannot be
  // added without also appearing here.
  const jumps = [
    { id: 'abbreviations', label: 'Abbreviations' },
    ...CONCEPT_GROUPS.map((g) => ({ id: g.id, label: g.title })),
    { id: 'network-measures', label: 'Network measures' },
    { id: 'ladder', label: 'The escalation ladder' },
    { id: 'chinese-terms', label: 'Chinese terms' },
  ];

  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Glossary</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        The words and abbreviations used across Kautilya
      </h1>
      <p className="mt-3 max-w-[64ch] text-[17px] leading-relaxed text-muted">
        Geopolitical reporting is dense with acronyms, and the site adds a vocabulary of its own.
        This page explains both in plain language. The abbreviations are the ones that actually
        recur in the headlines Kautilya reads; the rest is what its scores and labels mean.
      </p>

      <nav aria-label="Glossary sections" className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[14px]">
        {jumps.map((j) => (
          <a key={j.id} href={`#${j.id}`} className="text-muted hover:text-[color:var(--color-accent)]">{j.label}</a>
        ))}
      </nav>

      <Section id="abbreviations" title="Abbreviations"
        intro="Listed A to Z. Where the same letters mean different things in different countries, the entry says how to tell.">
        <Terms entries={ABBREVIATIONS} />
      </Section>

      {CONCEPT_GROUPS.map((g) => (
        <Section key={g.id} id={g.id} title={g.title} intro={g.intro}>
          <Terms entries={g.entries} />
        </Section>
      ))}

      <Section id="network-measures" title="Network measures"
        intro="Printed beside the network graph and on each person’s page. The plain name comes first; the name a network scientist would use is given for anyone who wants to read further.">
        <Terms entries={NETWORK_MEASURES} />
      </Section>

      <Section id="ladder" title="The escalation ladder"
        intro="Chinese official statements use a fixed sequence of formulae, and the phrase chosen encodes a deliberate position. Kautilya detects these and reports the rung, where a translation would flatten them all to “criticised”. Severity runs from 0 to 100.">
        <Panel className="p-4">
          <ol className="space-y-3">
            {ESCALATION_LADDER.map((r) => (
              <li key={r.rung} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="mono-num w-6 text-right text-[14px] text-faint" aria-label={`Rung ${r.rung}`}>{r.rung}</span>
                <span className="w-44 flex-none">
                  <ChineseText text={r.zh} size="small" accent clamp={false} />
                </span>
                <span className="min-w-0 flex-1 basis-64">
                  <span className="text-[15px] text-text">{r.en}</span>
                  <span className="ml-2 mono-num text-[13px] text-faint">severity {r.severity}</span>
                  <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{r.gloss}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </Section>

      <Section id="chinese-terms" title="Chinese terms">
        <Panel className="p-4">
          <p className="max-w-[64ch] text-[15px] leading-relaxed text-muted">
            Beyond the ladder, Kautilya recognises {ZH_GLOSSARY.length} Chinese terms in headlines — place
            names, military vocabulary, sovereignty language and the bodies that issue statements — and
            glosses them in English. They have their own page, with pinyin and a note on why each one matters.
          </p>
          <Link href="/glossary/chinese" className="mt-3 inline-block text-[15px] text-[color:var(--color-accent)] hover:underline">
            Browse the Chinese terms →
          </Link>
        </Panel>
      </Section>
    </div>
  );
}
