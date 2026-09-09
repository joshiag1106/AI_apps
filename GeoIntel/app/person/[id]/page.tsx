import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle } from '@/components/ui';
import { Paywall } from '@/components/Paywall';
import { NetworkGraph } from '@/components/NetworkGraph';
import { NetworkMetrics } from '@/components/NetworkMetrics';
import { corpus } from '@/lib/queries';
import { personGraph, isPersonNode } from '@/lib/graph/build';
import { personPanel } from '@/lib/graph/person-panel';
import { parseTrail, encodeTrail, trailNode, isKnownNode, DEFAULT_TOP_N } from '@/lib/graph/ego';
import { consume } from '@/lib/quota';
import { BY_PERSON, PEOPLE } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * The person drilldown: one official and the states they are named alongside.
 *
 * Same shape as app/network/[iso]/page.tsx — gate, wire up the walk, render what
 * personPanel hands back — and deliberately no measure computed here. See
 * lib/graph/person-panel.ts for why the measure set differs from the country panel's.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = BY_PERSON.get(id.toLowerCase());
  return { title: p ? `${p.name} — network` : 'Person' };
}

export default async function PersonPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string; n?: string }>;
}) {
  const { id: raw } = await params;
  const { trail: rawTrail, n: rawN } = await searchParams;
  const id = raw.toLowerCase();
  const person = BY_PERSON.get(id);
  if (!person) notFound();

  // A walk crosses both node kinds, so a trail token may name a person or a state. Anything
  // that is neither is dropped rather than rendered as a link to nowhere. The predicate is
  // shared with /network/[iso] rather than written out here: carrying it separately is what
  // let the two pages disagree about people — see isKnownNode.
  const trail = parseTrail(rawTrail, id).filter(isKnownNode);

  // One credit per walk, keyed on where the walk began — the same rule as the state network.
  //
  // NOT the same credit, though, and the comment here used to claim otherwise. consume()
  // keys on (subject, action, target) and the two views pass different actions, so crossing
  // from a person into a state spends one 'person_network' credit AND one 'network_graph'
  // credit. That was already true before person↔person edges existed; it is worth stating
  // now because crossing between the two views went from an edge case to the ordinary way
  // this feature is used. Merging the two actions would be a pricing decision, not a fix.
  const gate = await consume('person_network', trail[0]);

  // Before any engine work: a reader who cannot see the result should not pay for it.
  if (!gate.allowed) {
    return (
      <div className="space-y-4">
        <SectionTitle level={1}>{person.name} — network</SectionTitle>
        <Paywall what={`The ${person.name} connection network`} kind={gate.kind} />
      </div>
    );
  }

  const graph = personGraph(corpus());
  const topN = Math.max(3, Math.min(24, Number(rawN) || DEFAULT_TOP_N));
  const panel = personPanel(graph, id, topN);
  const homeName = BY_ISO.get(person.home)?.name ?? person.home;

  // Counted, never written down. This whole feature exists because a measurement was pinned
  // into a spec against a twelve-name roster and never redone when the roster reached 120;
  // a hardcoded "63 of 120" in the caption below would go stale the same silent way.
  const listed = PEOPLE.length;
  const present = graph.nodes.filter(isPersonNode).length;

  return (
    <div className="space-y-4">
      <SectionTitle level={1}>{person.name} — network</SectionTitle>
      <p className="text-[11px] text-muted">
        {person.role}, {homeName} ·{' '}
        <Link href="/person" className="hover:text-[color:var(--color-accent)]">All people</Link>
      </p>

      <nav aria-label="Walk" className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {trail.map((t, i) => {
          // parseTrail uppercases every token and roster ids are lowercase, so a person
          // must be resolved back before it can be named or linked — see trailNode.
          const node = trailNode(t);
          const name = BY_PERSON.get(node.id)?.name ?? node.id;
          return (
            <span key={`${t}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-faint">→</span>}
              {i === trail.length - 1
                ? <span className="text-text">{name}</span>
                : <Link
                    href={`${node.person ? '/person' : '/network'}/${encodeURIComponent(node.id)}?trail=${encodeTrail(trail.slice(0, i))}`}
                    className="hover:text-[color:var(--color-accent)]">{name}</Link>}
            </span>
          );
        })}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <NetworkGraph view={panel.view} trail={trail} topEvents={graph.topEvents} />
          <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
            An edge means {person.name} and that node were named in the same clustered event —
            a reporting relationship, not a claim that either acted toward the other. The tie
            to {homeName} is affiliation and is left out of the friction total.
          </p>
          <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
            <strong className="text-text">A line to another official is not a meeting.</strong>{' '}
            It says only that the two were named in the same event: not a call, an agreement or
            a dispute, and the engine cannot tell which. Headlines rarely help — a report that
            names two figures usually has its verb pointed at a third party, so no edge here
            carries an action. The states on an edge are what the reporting was{' '}
            <em>about</em>, not where anyone was.
          </p>
          <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
            This view sees only the officials on the roster, and{' '}
            <span className="mono-num">{present}</span> of the{' '}
            <span className="mono-num">{listed}</span> listed appear in the current corpus at
            all. A missing line therefore means &ldquo;not both named in one event&rdquo;,
            never &ldquo;no relationship&rdquo;, and an absence is not evidence that someone
            was uninvolved.
          </p>
        </Panel>

        <Panel>
          <div className="p-4">
            <NetworkMetrics rows={panel.rows} degree={panel.degree} />
          </div>
        </Panel>
      </div>

      {!gate.unlimited && (
        <p className="text-center text-[11px] text-faint">
          {gate.remaining} of {gate.limit} free analyses remaining ·{' '}
          <Link href="/pricing" className="underline decoration-dotted hover:text-muted">See plans</Link>
        </p>
      )}
    </div>
  );
}
