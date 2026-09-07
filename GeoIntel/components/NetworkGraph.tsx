import Link from 'next/link';
import { nodeHref, nodeLabel, personBox, type EgoView } from '@/lib/graph/ego';
import { countryName } from '@/lib/queries';
import { radialLayout } from '@/lib/graph/layout';
import { edgeKey, isPersonNode } from '@/lib/graph/build';

/**
 * An ego view as server-rendered SVG, following components/charts.tsx: no charting
 * library, every mark matching the design system, and nothing requiring the client.
 *
 * Each neighbour is a link, so walking the network is ordinary navigation — the back
 * button is the undo, a walk is a shareable URL, and there is no graph state to hydrate.
 */
export function NetworkGraph({ view, trail, topEvents }: {
  view: EgoView;
  trail: string[];
  /**
   * Strongest source items behind each edge (built in Task 1, keyed by edgeKey(a, b)).
   * The spec calls this out as "letting the UI show the evidence behind a line" — until
   * this component names one, it is computed on every edge and rendered nowhere. Typed
   * structurally (just the field this component reads) rather than as GeoEvent, so the
   * graph-rendering layer stays as agnostic of node/event semantics as the engine is.
   */
  topEvents: Map<string, { title: string }[]>;
}) {
  const { nodes, size } = radialLayout(view);
  if (!nodes.length) {
    return <p className="p-6 text-[12px] text-muted">No connections recorded for this state in the current corpus.</p>;
  }

  const at = new Map(nodes.map((n) => [n.id, n]));
  const maxFriction = Math.max(...view.edges.map((e) => e.friction), 1);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" role="img"
         aria-label={`Network around ${view.focus}, ${view.neighbours.length} connections shown`}>
      {view.edges.map((e) => {
        const p = at.get(e.a); const q = at.get(e.b);
        if (!p || !q) return null;
        const spoke = e.a === view.focus || e.b === view.focus;
        return (
          <g key={`${e.a}|${e.b}`}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke="var(--color-severe)"
              strokeWidth={0.8 + 3.4 * (e.friction / maxFriction)}
              strokeOpacity={spoke ? 0.55 : 0.22} />
            {e.alignmentEvents > 0 && (
              // The alignment overlay: dashed, distinct, and never drawn without its count.
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke="var(--color-verified)" strokeWidth="1.6" strokeDasharray="3 3" strokeOpacity="0.85">
                <title>{`${e.a}–${e.b}: ${e.alignmentEvents} de-escalatory event${e.alignmentEvents === 1 ? '' : 's'} of ${e.events}`}</title>
              </line>
            )}
          </g>
        );
      })}

      {nodes.map((n) => {
        const isFocus = n.id === view.focus;
        const edge = view.edges.find((e) =>
          (e.a === view.focus && e.b === n.id) || (e.b === view.focus && e.a === n.id));
        // The strongest event behind this spoke, if any is on record. Guarded rather
        // than asserted: buildGraph always populates at least one contributor for an
        // edge that exists at all, but a hand-built or synthetic graph is not obliged to.
        const top = edge ? topEvents.get(edgeKey(edge.a, edge.b)) : undefined;
        const topTitle = top && top.length > 0 ? top[0].title : null;
        // Shape, not colour, separates a person from a state. Colour is what the palette
        // control reassigns, so a hard-coded hue would be the one mark on the page that
        // ignores a reader's accessibility choice — and in Monochrome it would vanish.
        const person = isPersonNode(n.id);
        const label = nodeLabel(n.id);
        // A person's width comes from its label, which radialLayout knows nothing about, so
        // personBox caps and clamps it — see there. Circles keep the layout's own geometry.
        const box = person ? personBox(label, n.r, n.x, size) : { w: 2 * n.r, cx: n.x, label };
        const shape = person ? (
          <rect x={box.cx - box.w / 2} y={n.y - n.r} width={box.w} height={2 * n.r} rx={n.r}
            fill={isFocus ? 'var(--color-accent)' : 'var(--color-panel)'}
            stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth="1.5" />
        ) : (
          <circle cx={n.x} cy={n.y} r={n.r}
            fill={isFocus ? 'var(--color-accent)' : 'var(--color-panel)'}
            stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth="1.5" />
        );
        const circle = (
          <>
            {shape}
            <text x={box.cx} y={n.y + 4} textAnchor="middle"
              className="mono-num"
              fontSize={isFocus ? 13 : 11}
              fill={isFocus ? 'var(--color-ink)' : 'var(--color-text)'}>{box.label}</text>
            <title>{edge
              ? `${label} — friction ${edge.friction}, ${edge.events} shared event${edge.events === 1 ? '' : 's'}`
                + (topTitle ? `\nStrongest: ${topTitle}` : '')
                // Capped at three with the remainder counted, matching how the neighbour cap
                // is already disclosed. One edge in the live corpus picks up six states from
                // four events; the whole list is noise rather than context.
                + (edge.context.length
                    ? `\nSeen in: ${edge.context.slice(0, 3).join(', ')}`
                      + (edge.context.length > 3 ? ` and ${edge.context.length - 3} more` : '')
                    : '')
              : label}</title>
          </>
        );
        return isFocus ? <g key={n.id}>{circle}</g> : (
          // The node's own name, spelled out. Without this the link's name is whatever the
          // SVG <text> children concatenate to — "CHN68", a country code fused to a score
          // with nothing to say which is which or that the number is a count of events.
          // The <title> above is a tooltip and does not name the link.
          <Link
            key={n.id}
            href={nodeHref(n.id, trail)}
            // countryName, not the drawn label: the circle says CHN because three
            // characters is what fits in it, and a reader hearing "C H N" is being handed
            // the layout's constraint instead of the country. Mandala already says China.
            aria-label={`${person ? label : countryName(n.id)}, ${person ? 'official' : 'state'}`
              + (edge ? `, ${edge.events} shared event${edge.events === 1 ? '' : 's'}` : '')
              + `. Open ${person ? 'their' : 'its'} network.`}
          >{circle}</Link>
        );
      })}
    </svg>
  );
}
