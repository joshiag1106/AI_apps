import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle } from '@/components/ui';
import { Paywall } from '@/components/Paywall';
import { NetworkGraph } from '@/components/NetworkGraph';
import { NetworkMetrics } from '@/components/NetworkMetrics';
import { corpus } from '@/lib/queries';
import { stateGraph } from '@/lib/graph/build';
import { parseTrail, encodeTrail, trailNode, isKnownNode, DEFAULT_TOP_N } from '@/lib/graph/ego';
import { BY_PERSON } from '@/data/people';
import { networkPanel } from '@/lib/graph/panel';
import { consume } from '@/lib/quota';
import { BY_ISO } from '@/data/countries';

/**
 * The drilldown for the network graph engine built in Tasks 1-6.
 *
 * Every analytical number here comes from one call to networkPanel() — see
 * lib/graph/panel.ts for why that single call, rather than this page computing measures
 * itself next to a separately derived ego view, is what keeps the full-graph rule true.
 * This file's job is only to gate, wire up the walk trail, and render what it is handed.
 *
 * Note: unlike its own template, this page does not wrap its return in a second
 * `<main className="mx-auto max-w-[1400px] px-4 py-6">`. app/layout.tsx:51 already
 * supplies that wrapper for every page (see app/country/[iso]/page.tsx and
 * app/dyad/[pair]/page.tsx, neither of which re-wraps); nesting it here would double the
 * padding and was not intentional in the source this page was adapted from.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const c = BY_ISO.get(iso.toUpperCase());
  return { title: c ? `${c.name} — network` : 'Network' };
}

export default async function NetworkPage({
  params, searchParams,
}: {
  params: Promise<{ iso: string }>;
  searchParams: Promise<{ trail?: string; n?: string }>;
}) {
  const { iso: raw } = await params;
  const { trail: rawTrail, n: rawN } = await searchParams;
  const iso = raw.toUpperCase();
  const country = BY_ISO.get(iso);
  if (!country) notFound();

  // parseTrail sanitises the shape of the trail but cannot know which tokens name real
  // nodes — it is deliberately free of country and roster data. isKnownNode drops the ones
  // naming nothing, keeping junk out of the breadcrumb and out of the links it generates.
  // The focus itself always survives: it was validated against BY_ISO above, and parseTrail
  // appends it last, so `trail` is never empty.
  //
  // A WALK CROSSES BOTH NODE KINDS, so people are kept rather than filtered out. This tested
  // states only until 2026-09-06, which silently deleted every person from the breadcrumb the
  // moment a reader stepped from an official into a state — a mixed walk lost its history on
  // this side. It also moved `entry` below from the walk's true origin to the first STATE in
  // it; the credit count is unchanged either way, because later hops share whatever key the
  // first one set, but the origin now names where the walk actually began.
  const trail = parseTrail(rawTrail, iso).filter(isKnownNode);

  /*
   * One credit per WALK, keyed on where that walk began.
   *
   * consume() keys on the unique (action, target) triple with the subject, so the target
   * decides what a credit buys. Charging per state viewed would spend a five-action
   * allowance in five clicks of a drilldown, which is why this was never keyed on `iso`.
   * But the first fix for that was a constant — every reader paid once and then had all 68
   * states forever, while the same reader still paid per country on /country/[iso]. The
   * walk's origin is the honest middle: following a thread out from CHN costs one credit
   * however far it runs, and coming back later to start a fresh walk from IND costs
   * another. trail[0] is that origin — parseTrail keeps the walk in order and appends the
   * current focus last, so on the first page of a walk the origin is simply this state.
   *
   * This is soft, in exactly the way the rest of the metering is soft: someone who appends
   * `?trail=CHN` to any state can present every page as a continuation of a walk they have
   * already paid for. /methodology says outright that device metering is trivially cleared
   * and only account-bound metering is real enforcement, and this sits in that same class —
   * it prices ordinary use correctly and does not pretend to withstand a determined reader.
   */
  const entry = trail[0];
  const gate = await consume('network_graph', entry);

  // Before any engine work. networkPanel runs an all-sources Dijkstra sweep, 100 power
  // iterations, a k-core peel and up to 20 label-propagation passes — all of which used to
  // run above the return and then be discarded by the paywall branch, on a force-dynamic
  // route with no rate limit above the device cookie. A reader who cannot see the result
  // should not pay for computing it.
  if (!gate.allowed) {
    return (
      <div className="space-y-4">
        <SectionTitle level={1}>{country.name} — network</SectionTitle>
        <Paywall what={`The ${country.name} connection network`} kind={gate.kind} />
      </div>
    );
  }

  const events = corpus();
  const graph = stateGraph(events);
  const topN = Math.max(3, Math.min(24, Number(rawN) || DEFAULT_TOP_N));

  // The one call. Every measure is run against the whole of `graph` before the ego view
  // is cut down to topN for drawing — see lib/graph/panel.ts.
  const panel = networkPanel(graph, iso, topN);

  // How much to caveat the panel is decided from panel.degree — the full-graph degree
  // computed in networkPanel — rather than from panel.view.neighbours, which is the capped
  // list that gets drawn. The old reading off the view was correct only because topN is
  // clamped to >= 3 here, an invariant maintained twelve lines away and covered by no test;
  // and it excluded degree 0 entirely, so a state with NO connections was the one state
  // that got no caveat at all.

  return (
    <div className="space-y-4">
      <SectionTitle level={1}>{country.name} — network</SectionTitle>

        <nav aria-label="Walk" className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
          {trail.map((t, i) => {
            // A trail token may name either kind, and the two live on different routes —
            // see trailNode for why a person needs resolving back out of parseTrail's
            // uppercasing before it can be named or linked.
            const node = trailNode(t);
            const name = node.person ? (BY_PERSON.get(node.id)?.name ?? node.id) : node.id;
            return (
              <span key={`${t}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-faint">→</span>}
                {i === trail.length - 1
                  ? <span className="text-text">{name}</span>
                  : <Link href={`${node.person ? '/person' : '/network'}/${encodeURIComponent(node.id)}?trail=${encodeTrail(trail.slice(0, i))}`}
                          className="hover:text-[color:var(--color-accent)]">{name}</Link>}
              </span>
            );
          })}
        </nav>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <NetworkGraph view={panel.view} trail={trail} topEvents={graph.topEvents} />
            <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
              Line thickness is friction. Dashed lines mark the{' '}
              <span className="text-[color:var(--color-verified)]">de-escalatory signal</span>, which
              across the whole corpus rests on a small number of events and is an overlay rather
              than a measurement of cooperation. Click any state to walk to it.
            </p>
          </Panel>

          <Panel>
            <div className="p-4">
              <NetworkMetrics rows={panel.rows} degree={panel.degree} />
            </div>
          </Panel>
        </div>

        {/*
          Every other metered page carries this (country:144, dyad:157, events:210) and
          this one did not — so the network was the one feature that could silently spend
          a reader's last free credit without ever saying what it cost. Nav shows the
          balance too, but a reader looking at the thing they just paid for should not
          have to go looking for the receipt.
        */}
        {!gate.unlimited && (
          <p className="text-center text-[11px] text-faint">
            {gate.remaining} of {gate.limit} free analyses remaining ·{' '}
            <Link href="/pricing" className="underline decoration-dotted hover:text-muted">See plans</Link>
          </p>
        )}
    </div>
  );
}
