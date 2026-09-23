import { Empty } from '@/components/ui';
import { LensBeat } from '@/components/LensBeat';
import { lensData, countryName } from '@/lib/queries';
import { MIN_ARTICLES } from '@/lib/lens/compare';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Language Lens' };

export default function LensPage() {
  const beats = lensData();
  const isos = new Set(beats.flatMap((b) => b.columns.flatMap((c) => c.others.map((o) => o.key))));
  const names = Object.fromEntries([...isos].map((iso) => [iso, countryName(iso)]));

  return (
    <div className="space-y-5">
      <section>
        <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Language Lens</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">One topic, asked in several languages</h1>
        <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted">
          Kautilya puts the same questions to news searches in each language with a stake in them. Here they
          are side by side: what each language was asked, how its reporting frames the topic, which other
          states it brings in, and its newest headlines to read for yourself.
        </p>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-faint">
          This compares Kautilya&apos;s sample — the reports those searches return — not each country&apos;s
          press as a whole. The searches are worded differently in each language, shown under every column,
          so part of any difference can come from the question rather than the answer. Framing is counted only
          from reports whose own wording shows one; where too few do, the column says so rather than guess. A difference is called
          out only when it is at least 10 points wide and unlikely to be chance (a two-proportion test, p &lt; 0.01).
        </p>
      </section>

      {beats.length ? (
        beats.map((b) => <LensBeat key={b.id} beat={b} names={names} />)
      ) : (
        <Empty>Not enough reporting yet — a topic appears here once two languages each have {MIN_ARTICLES} reports on it.</Empty>
      )}
    </div>
  );
}
