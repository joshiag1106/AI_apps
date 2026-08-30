import Link from 'next/link';
import { SectionTitle, Panel, Badge, Empty } from '@/components/ui';
import { EventCard } from '@/components/EventCard';
import { corpus, eventsFor, countryName } from '@/lib/queries';
import { COUNTRIES } from '@/data/countries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Event feed' };

const DOMAINS = ['Military', 'Maritime', 'Cyber', 'Economic', 'Energy', 'Nuclear', 'Diplomatic', 'Internal', 'Technology', 'Space'];

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const events = corpus();
  const filtered = eventsFor({
    actor: sp.actor, domain: sp.domain, language: sp.lang,
    query: sp.q, minConfidence: sp.min ? Number(sp.min) : undefined, limit: 90,
  }, events);

  const chip = (label: string, active: boolean, href: string) => (
    <Link key={label} href={href}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-line)] text-muted hover:border-[color:var(--color-accent-dim)]'}`}>
      {label}
    </Link>
  );

  const base = (over: Record<string, string | undefined>) => {
    const merged = { ...sp, ...over };
    const qs = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
    return `/events${qs ? `?${qs}` : ''}`;
  };

  const actorsPresent = [...new Set(events.flatMap((e) => e.actors))];
  const topActors = COUNTRIES.filter((c) => actorsPresent.includes(c.iso)).slice(0, 14);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Event feed</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">All tracked events</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Browsing and filtering are free and unmetered. Opening an event&apos;s full verification
          evidence counts against the free allowance.
        </p>
      </div>

      <Panel className="space-y-3 p-3.5">
        <form action="/events" className="flex gap-2">
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Search event headlines…"
            className="flex-1 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-1.5 text-[12.5px] outline-none focus:border-[color:var(--color-accent-dim)]" />
          <button className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-[12px] text-text hover:border-[color:var(--color-accent-dim)]">Search</button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wider text-faint">Domain</span>
          {chip('All', !sp.domain, base({ domain: undefined }))}
          {DOMAINS.map((d) => chip(d, sp.domain === d, base({ domain: d })))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wider text-faint">Language</span>
          {chip('All', !sp.lang, base({ lang: undefined }))}
          {chip('中文 Chinese', sp.lang === 'zh', base({ lang: 'zh' }))}
          {chip('English', sp.lang === 'en', base({ lang: 'en' }))}
          {chip('हिन्दी Hindi', sp.lang === 'hi', base({ lang: 'hi' }))}
          {chip('Русский', sp.lang === 'ru', base({ lang: 'ru' }))}
          {chip('日本語', sp.lang === 'ja', base({ lang: 'ja' }))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wider text-faint">Corroboration</span>
          {chip('Any', !sp.min, base({ min: undefined }))}
          {chip('≥ 50', sp.min === '50', base({ min: '50' }))}
          {chip('≥ 70', sp.min === '70', base({ min: '70' }))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wider text-faint">Actor</span>
          {chip('All', !sp.actor, base({ actor: undefined }))}
          {topActors.map((c) => chip(c.name, sp.actor === c.iso, base({ actor: c.iso })))}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="var(--color-accent)">{filtered.length} events</Badge>
        {sp.actor && <span className="text-[11px] text-muted">involving {countryName(sp.actor)}</span>}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-faint">
          Export this view
          <a href={`/api/export${base({}).replace('/events', '')}${base({}).includes('?') ? '&' : '?'}format=csv`}
            className="rounded border border-[color:var(--color-line)] px-2 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">CSV</a>
          <a href={`/api/export${base({}).replace('/events', '')}${base({}).includes('?') ? '&' : '?'}format=json`}
            className="rounded border border-[color:var(--color-line)] px-2 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">JSON</a>
        </span>
      </div>

      {filtered.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      ) : <Empty>No events match these filters. Try widening them.</Empty>}
    </div>
  );
}
