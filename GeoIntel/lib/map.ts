import 'server-only';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import { COUNTRIES } from '@/data/countries';

/** world-atlas names that differ from the gazetteer's. */
const NAME_OVERRIDES: Record<string, string> = {
  'United States of America': 'USA',
  'Dem. Rep. Congo': 'COD',
  'Bosnia and Herz.': 'BIH',
  'Czechia': 'CZE',
  "Côte d'Ivoire": 'CIV',
  'Dominican Rep.': 'DOM',
  'Eq. Guinea': 'GNQ',
  'S. Sudan': 'SSD',
  'Central African Rep.': 'CAF',
  'Solomon Is.': 'SLB',
};

const BY_NAME = new Map<string, string>([
  ...COUNTRIES.map((c) => [c.name, c.iso] as [string, string]),
  ...Object.entries(NAME_OVERRIDES),
]);

export interface MapShape { iso: string | null; name: string; d: string }

let _shapes: MapShape[] | null = null;

/**
 * Project the world once per process. Paths are computed on the server and handed to
 * the client as strings, so the 100KB topology never reaches the browser bundle.
 */
interface Feat { properties: { name: string } }

/**
 * Antarctica is excluded from the projection fit. It carries no events and occupies
 * roughly a sixth of the vertical extent, which would push the whole board below the
 * fold to render an empty band.
 */
function fitted(width: number, height: number) {
  const fc = feature(
    topo as never,
    (topo as never as { objects: { countries: never } }).objects.countries,
  ) as unknown as { type: string; features: Feat[] };
  const inhabited = { type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.name !== 'Antarctica') };
  return { fc: inhabited as unknown as { features: Feat[] }, projection: geoNaturalEarth1().fitSize([width, height], inhabited as never) };
}

export function worldShapes(width = 960, height = 400): MapShape[] {
  if (_shapes) return _shapes;
  const { fc, projection } = fitted(width, height);
  const path = geoPath(projection);

  _shapes = (fc.features as unknown as never[]).map((f: never) => {
    const name = (f as Feat).properties.name;
    return { iso: BY_NAME.get(name) ?? null, name, d: path(f as never) ?? '' };
  }).filter((s) => s.d);
  return _shapes;
}

/** Screen position for a lat/lon, for plotting flashpoint markers over the map. */
export function project(lon: number, lat: number, width = 960, height = 400): [number, number] | null {
  const p = fitted(width, height).projection([lon, lat]);
  return p ? [p[0], p[1]] : null;
}
