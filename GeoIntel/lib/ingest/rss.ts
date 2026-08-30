import { XMLParser } from 'fast-xml-parser';
import type { RawArticle } from '@/lib/types';
import { detectLanguage } from '@/lib/lang/detect';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

export class FeedError extends Error {
  constructor(public url: string, message: string) {
    super(message);
    this.name = 'FeedError';
  }
}

export async function fetchFeed(url: string, timeoutMs = 15000): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctl.signal });
    if (!res.ok) throw new FeedError(url, `HTTP ${res.status}`);
    const body = await res.text();
    // Several ministry endpoints answer 200 with an HTML maintenance page. Treat a
    // response with no feed root as a failure rather than silently ingesting nothing.
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) throw new FeedError(url, 'response is not a feed (likely an HTML page)');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  // An attribute-only element (Atom's <link href="..."/>) has no text. Returning
  // String(v) here yields the literal "[object Object]", which then looks like a valid
  // URL to every caller — that silently collapsed whole Atom feeds to a single item.
  return '';
}

/**
 * The item's canonical URL, across RSS and Atom.
 * RSS puts it in <link>text</link>; Atom uses <link rel="alternate" href="..."/> and
 * may carry several link elements with different rel values.
 */
function linkOf(item: Record<string, unknown>): string {
  const direct = text(item.link);
  if (direct.startsWith('http')) return direct;

  const links = asArray<Record<string, unknown>>(
    item.link as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  const alternate = links.find((l) => l?.['@_rel'] === 'alternate' && typeof l['@_href'] === 'string');
  const anyHref = links.find((l) => typeof l?.['@_href'] === 'string');
  const href = String((alternate ?? anyHref)?.['@_href'] ?? '');
  if (href.startsWith('http')) return href;

  const guid = text(item.guid);
  return guid.startsWith('http') ? guid : '';
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Google News appends " - Outlet" to every headline. Strip it for clean display. */
export function splitTitleOutlet(raw: string): { title: string; outlet: string | null } {
  const i = raw.lastIndexOf(' - ');
  if (i > 12 && raw.length - i < 60) {
    return { title: raw.slice(0, i).trim(), outlet: raw.slice(i + 3).trim() };
  }
  return { title: raw.trim(), outlet: null };
}

type AttrBag = Record<string, unknown>;

/**
 * Best available image for an item.
 *
 * Feeds routinely offer the same picture at several widths — the Guardian sends 140px
 * and 460px versions of every photo — and they are not ordered largest-first. Taking
 * the first match yields a thumbnail that renders blurry at card size, so pick by
 * declared width instead, treating an unlabelled candidate as a modest fallback.
 */
export function bestImage(item: Record<string, unknown>): string | null {
  const candidates: { url: string; width: number }[] = [];

  const collect = (bag: AttrBag | AttrBag[] | undefined) => {
    for (const m of asArray<AttrBag>(bag)) {
      const url = m?.['@_url'];
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      // A declared type that is not an image disqualifies the candidate outright.
      // YouTube advertises its legacy Flash player as media:content at 640px wide —
      // wider than the real thumbnail, so a width-only rule picks the player URL and
      // renders a broken image.
      const type = String(m?.['@_type'] ?? '');
      if (type && !type.startsWith('image/')) continue;
      const w = Number(m?.['@_width']);
      candidates.push({ url, width: Number.isFinite(w) && w > 0 ? w : 200 });
    }
  };

  collect(item['media:content'] as AttrBag | AttrBag[] | undefined);
  collect(item['media:thumbnail'] as AttrBag | AttrBag[] | undefined);
  collect(item['enclosure'] as AttrBag | AttrBag[] | undefined);

  // YouTube nests its media inside <media:group> rather than at item level.
  for (const g of asArray<AttrBag>(item['media:group'] as AttrBag | AttrBag[] | undefined)) {
    collect(g?.['media:thumbnail'] as AttrBag | AttrBag[] | undefined);
    collect(g?.['media:content'] as AttrBag | AttrBag[] | undefined);
  }

  if (candidates.length) {
    return candidates.reduce((best, c) => (c.width > best.width ? c : best)).url;
  }
  const desc = `${text(item['description'])} ${text(item['content:encoded'])}`;
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m && m[1].startsWith('http') ? m[1] : null;
}

export interface ParseOpts {
  defaultOutlet?: string;
  beatId?: string | null;
  localeKey?: string | null;
  languageHint?: string;
}

export function parseFeed(xml: string, opts: ParseOpts = {}): RawArticle[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF'] ?? doc?.feed ?? {};
  const items = asArray(channel.item ?? channel.entry ?? doc?.feed?.entry);

  const out: RawArticle[] = [];
  for (const it of items) {
    const rawTitle = stripHtml(text(it.title));
    if (!rawTitle) continue;

    const link = linkOf(it);
    if (!link) continue;

    const { title, outlet: fromTitle } = splitTitleOutlet(rawTitle);
    const outlet =
      text(it.source) || (it.source?.['#text'] ? String(it.source['#text']) : '') ||
      fromTitle || opts.defaultOutlet || 'Unknown source';

    const published =
      text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']);
    const iso = published ? new Date(published).toISOString() : new Date().toISOString();

    const snippet = stripHtml(text(it.description) || text(it.summary) || text(it.content));

    const videoId = text(it['yt:videoId']) || null;

    out.push({
      url: link,
      title,
      outlet: String(outlet).trim(),
      publishedAt: Number.isNaN(Date.parse(iso)) ? new Date().toISOString() : iso,
      // Google News descriptions are link markup; drop them when they just echo the title.
      snippet: snippet.startsWith(title) ? '' : snippet.slice(0, 400),
      imageUrl: bestImage(it),
      language: opts.languageHint ?? detectLanguage(title),
      beatId: opts.beatId ?? null,
      localeKey: opts.localeKey ?? null,
      videoId,
    });
  }
  return out;
}
