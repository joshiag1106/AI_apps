import Link from 'next/link';
import { RevealOnView } from '@/components/RevealOnView';
import { ChineseText } from '@/components/ChineseText';
import { ESCALATION_LADDER } from '@/data/glossary.zh';
import { BY_ISO } from '@/data/countries';
import { dotPosition, axisTicks, dayLabel, windowDays, type Trail, type TrailDot } from '@/lib/verify/trail';

const name = (iso: string | null) => (iso ? BY_ISO.get(iso)?.name ?? iso : 'target not stated');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A dot's size follows the ladder's own severity, not a new scale. It is small on purpose: days
 * sit about 9px apart on a desktop axis (3px on a phone), and a dot much wider than that runs into
 * its neighbours. The first version, 9–22px, did — measured in a real build.
 */
export function dotDiameter(rung: number): number {
  const severity = ESCALATION_LADDER.find((r) => r.rung === rung)?.severity ?? 10;
  return 7 + Math.round((severity / 100) * 9);
}

/** Inside a lane: 12px of padding each side, so an edge dot stays inside the box. */
const along = (f: number) => `calc(12px + (100% - 24px) * ${f})`;

function label(d: TrailDot): string {
  const reports = d.originals < d.reports ? `${plural(d.reports, 'report')}, ${plural(d.originals, 'original')}` : plural(d.reports, 'report');
  // The ring that marks a new high is visual, so it is said here and in the table too: the chart
  // may add nothing the table lacks.
  return `Beijing to ${name(d.target)}, ${dayLabel(d.day)}: rung ${d.rung}${d.newHigh ? ' (new high)' : ''}, ${d.en} — ${reports}`;
}

/**
 * When Beijing used an escalation formula, and about whom: one row per country, one dot per day.
 * The chart is a picture of the table beneath it — every dot's headlines are listed there, so it
 * reads without JavaScript or a pointer. Nothing is drawn as a line: no dot means no formula was
 * found in a headline, not that things were calm.
 */
export function LadderTrail({ trail, only }: { trail: Trail; only?: string }) {
  const rows = only ? trail.rows.filter((r) => r.target === only) : trail.rows;
  const notStated = only ? [] : trail.notStated;
  const all = [...rows.flatMap((r) => r.dots), ...notStated];
  const since = dayLabel(trail.since);

  if (!all.length) {
    return (
      <div className="panel p-4" data-ladder-trail>
        <p className="text-[14px] leading-relaxed text-muted">
          No Beijing formula {only ? `about ${name(only)} ` : ''}found in headlines since {since}.
        </p>
      </div>
    );
  }

  const order = new Map([...all].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).map((d, i) => [d.key, i]));
  const ticks = axisTicks(trail);
  // A click target may not be wider than two days of axis, or it would take its neighbour's clicks.
  const reach = 2 / windowDays(trail);
  const lanes = [
    ...rows.map((r) => ({ id: r.target, who: name(r.target), dots: r.dots })),
    ...(notStated.length ? [{ id: 'none', who: 'target not stated', dots: notStated }] : []),
  ];

  const evidence = [...all].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .flatMap((d) => d.evidence.map((e, i) => ({ d, e, newHigh: d.newHigh && i === 0 })));

  return (
    <div className="panel p-4" data-ladder-trail>
      <p className="text-[13px] leading-relaxed text-faint">
        Each dot is a day on which a formula Beijing itself used appeared in a headline about that
        country. A bigger dot is a higher rung, and a ring marks a rung higher than any earlier dot in
        the row. Formulae are read from headlines and short snippets only, so a gap means none was
        found, not that things were calm. {trail.capped ? 'Showing the last 90 days.' : `Collecting since ${since}.`}{' '}
        Days that fall close together overlap on a narrow screen; the table below lists every one.
      </p>

      <RevealOnView>
        <div className="mt-3 space-y-1.5">
          {lanes.map((lane) => (
            <div key={lane.id} data-trail-row={lane.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
              <div className="flex-none text-[13px] text-muted sm:w-36">
                Beijing <span aria-hidden="true">→</span> {lane.who}
              </div>
              <div className="relative h-7 flex-1 rounded-sm bg-[color:var(--color-line-soft)]">
                {ticks.map((t) => (
                  <span key={t.at} aria-hidden="true" className="absolute inset-y-0 w-px bg-[color:var(--color-line)]" style={{ left: along(t.at) }} />
                ))}
                {lane.dots.map((d) => {
                  const size = dotDiameter(d.rung);
                  const text = label(d);
                  const box = 'absolute flex items-center justify-center';
                  // The click target is the dot, and never wider than two days of axis. A wider
                  // one (the first version used 24px) takes its neighbour's clicks: in a real
                  // build a click on the centre of the 13 Jul dot opened the 14 Jul event. On a
                  // phone, where days are 3px apart, the table below is the way in.
                  const pos = {
                    left: along(dotPosition(d.day, trail)), top: '50%', height: 24, transform: 'translate(-50%, -50%)',
                    width: `min(${size}px, calc((100% - 24px) * ${reach} - 1px))`,
                  };
                  const dot = (
                    <span className="reveal-scale block flex-none rounded-full" data-reveal-delay={Math.min(order.get(d.key) ?? 0, 20) * 45}
                      style={{
                        width: size, height: size, background: 'var(--color-zh)',
                        // A halo in the lane's own colour, so overlapping dots read as separate ones.
                        boxShadow: '0 0 0 1.5px var(--color-line-soft)',
                        outline: d.newHigh ? '2px solid var(--color-accent)' : undefined, outlineOffset: 2,
                      }} />
                  );
                  return d.eventId ? (
                    <Link key={d.key} href={`/events/${d.eventId}`} aria-label={text} title={text} data-trail-dot data-new-high={d.newHigh ? 'true' : undefined} className={box} style={pos}>{dot}</Link>
                  ) : (
                    <span key={d.key} role="img" aria-label={text} title={text} data-trail-dot data-new-high={d.newHigh ? 'true' : undefined} className={box} style={pos}>{dot}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="mt-1 flex justify-between px-3 text-[12px] text-faint sm:pl-[9.5rem]">
          {ticks.map((t) => <span key={t.at}>{t.label}</span>)}
        </div>
      </RevealOnView>

      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] text-muted hover:text-text">
          Every dated headline behind the dots ({evidence.length})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[13px]">
            <thead className="text-faint">
              <tr><th className="py-1 pr-3 font-normal">Date</th><th className="py-1 pr-3 font-normal">About</th><th className="py-1 pr-3 font-normal">Rung</th><th className="py-1 pr-3 font-normal">Headline</th><th className="py-1 font-normal">Outlet</th></tr>
            </thead>
            <tbody>
              {evidence.map(({ d, e, newHigh }) => {
                const headline = <ChineseText text={e.title} size="small" clamp={false} />;
                return (
                  <tr key={`${d.key}|${e.url}`} className="border-t border-[color:var(--color-line-soft)] align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{dayLabel(d.day)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{d.target ? name(d.target) : 'not stated'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{`rung ${e.rung}${newHigh ? ' · new high' : ''}`}</td>
                    <td className="py-1.5 pr-3">
                      {e.eventId ? <Link href={`/events/${e.eventId}`} data-trail-headline className="hover:text-[color:var(--color-accent)]">{headline}</Link> : headline}
                    </td>
                    <td className="py-1.5 text-faint">{e.outlet}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
