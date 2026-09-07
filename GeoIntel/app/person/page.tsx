import Link from 'next/link';
import { Panel, SectionTitle } from '@/components/ui';
import { corpus } from '@/lib/queries';
import { personGraph } from '@/lib/graph/build';
import { degree } from '@/lib/graph/metrics';
import { crossBorderFriction } from '@/lib/graph/person-panel';
import { PEOPLE, ROSTER_REVIEWED } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * The roster, and how much of it the corpus can actually see.
 *
 * This index exists because the alternative was a nav link to one hardcoded person, the
 * same shape as the `/network/CHN` link and with the same problem: whoever is chosen
 * becomes the person every reader spends their first credit on. A list costs one page and
 * removes the choice.
 *
 * Unmetered on purpose. It is browsing, like /events — the drilldown is where a credit is
 * spent. It also does the honest thing a roster-backed feature has to do somewhere: show
 * which officials the corpus has nothing on, rather than letting a reader discover that
 * one credit at a time.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'People' };

export default async function PeopleIndexPage() {
  const graph = personGraph(corpus());

  const rows = PEOPLE
    .map((p) => ({
      person: p,
      connections: degree(graph, p.id),
      // The same figure the person page headlines, via the same function, so the two
      // cannot drift apart under labels a reader reads as equivalent.
      friction: Math.round(crossBorderFriction(graph, p.id, p.home)),
    }))
    .sort((a, b) => b.connections - a.connections || (a.person.name < b.person.name ? -1 : 1));

  const seen = rows.filter((r) => r.connections > 0).length;

  return (
    <div className="max-w-4xl space-y-4">
      <SectionTitle>People</SectionTitle>
      <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted">
        Senior officials the engine recognises by name, and the states each is named
        alongside. An edge is a reporting relationship — the two appeared in the same
        clustered event — not a claim that a person acted toward a state.
      </p>
      <p className="max-w-3xl text-[11.5px] leading-relaxed text-faint">
        {seen} of {PEOPLE.length} on the roster appear in the current corpus. Coverage is
        exactly the roster: an official who is not listed is invisible here, so an absence is
        never evidence that someone was uninvolved. Roster last reviewed {ROSTER_REVIEWED}.
      </p>

      <Panel className="divide-y divide-[color:var(--color-line-soft)]">
        {rows.map(({ person, connections, friction }) => (
          <div key={person.id} className="flex items-baseline gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              {connections > 0
                ? <Link href={`/person/${person.id}`}
                        className="text-[13px] text-text hover:text-[color:var(--color-accent)]">{person.name}</Link>
                : <span className="text-[13px] text-muted">{person.name}</span>}
              <div className="text-[11px] text-muted">
                {person.role}, {BY_ISO.get(person.home)?.name ?? person.home}
              </div>
            </div>
            <div className="mono-num flex-none text-right text-[12px]">
              {connections > 0 ? (
                <>
                  <span className="text-text">{connections}</span>
                  <span className="text-faint"> states · cross-border </span>
                  <span className="text-text">{friction}</span>
                </>
              ) : (
                <span className="text-faint">not in the current corpus</span>
              )}
            </div>
          </div>
        ))}
      </Panel>

      <div className="flex gap-3">
        <Link href="/network/CHN" className="text-[12px] text-muted hover:text-[color:var(--color-accent)]">
          State network →
        </Link>
        <Link href="/methodology" className="text-[12px] text-muted hover:text-[color:var(--color-accent)]">
          Methodology →
        </Link>
      </div>
    </div>
  );
}
