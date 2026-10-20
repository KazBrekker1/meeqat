// Builds public/sky/sky-v1.bin and public/sky/names-v1.json from d3-celestial (BSD-3) at a pinned
// commit. Run from the repo root: bun scripts/sky/build-catalog.ts
// Sources behind d3-celestial: stars from XHIP (VizieR V/137D), constellations from the IAU,
// star-name translations from Stellarium's sky cultures.
import { encodeSkyCatalog, NO_CONSTELLATION, type CatalogSource, type NamesFile } from "../../app/utils/sky/catalog";

const COMMIT = "7e720a3de062059d4c5400a379146a601d9010e0";
const FILES = {
  stars: ["stars.6.json", "0297b8fa3adfbce1dc26566f61c4abcc1df4f29c6a28729ca06b56d1c6d25602"],
  starnames: ["starnames.json", "19c84bc885f8a97c3b8e1f6a380084c575a9758dedfe35256e911a823ec3a695"],
  constellations: ["constellations.json", "ab4ae692027cbc042c0d6791a84456a65eb7c55656107fd00c58ff6e55d4d8b2"],
  lines: ["constellations.lines.json", "294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c"],
} as const;
const MAX_MAG = 5.5;
const NAMED_MAX_MAG = 3.2;

async function fetchPinned(name: string, sha256: string): Promise<any> {
  const url = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${COMMIT}/data/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (got !== sha256) throw new Error(`${name}: sha256 ${got}, expected ${sha256}`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** d3-celestial stores right ascension as a longitude in −180…180. */
const ra = (lon: number) => (lon < 0 ? lon + 360 : lon);
/** Drop the bidi marks and odd spaces some names carry. */
const clean = (s: string | undefined) => (s ?? "").replace(/[‎‏]/g, "").replace(/[ - ]/g, " ").trim();

const [stars, starnames, constellations, lines] = await Promise.all(
  Object.values(FILES).map(([name, sha]) => fetchPinned(name, sha)),
);

const consList: { id: string }[] = constellations.features.map((f: any) => ({ id: f.id }));
const consIndex = (abbr: string | undefined) => {
  if (!abbr) return NO_CONSTELLATION;
  const i = consList.findIndex((c) => c.id === abbr || c.id.startsWith(abbr)); // "Ser" → Ser1
  return i < 0 ? NO_CONSTELLATION : i;
};

const src: CatalogSource = { stars: [], vertices: [], segments: [] };
const names: NamesFile = { stars: [], constellations: [] };

for (const f of stars.features) {
  const mag: number = f.properties.mag;
  if (mag > MAX_MAG) continue;
  const [lon, dec] = f.geometry.coordinates;
  const bv = Number.parseFloat(f.properties.bv);
  const n = starnames[String(f.id)];
  const index = src.stars.length;
  src.stars.push({ ra: ra(lon), dec, mag, bv: Number.isFinite(bv) ? bv : 0.6, cons: consIndex(n?.c) });
  if (n?.name && mag <= NAMED_MAX_MAG) names.stars.push([index, clean(n.name), clean(n.ar)]);
}

const vertexKey = new Map<string, number>();
const vertex = (lon: number, dec: number) => {
  const key = `${ra(lon).toFixed(4)},${dec.toFixed(4)}`;
  let i = vertexKey.get(key);
  if (i === undefined) {
    i = src.vertices.length;
    src.vertices.push({ ra: ra(lon), dec });
    vertexKey.set(key, i);
  }
  return i;
};
for (const f of lines.features) {
  const c = consList.findIndex((x) => x.id === f.id);
  if (c < 0) throw new Error(`figure ${f.id} has no constellation`);
  for (const line of f.geometry.coordinates as [number, number][][]) {
    for (let k = 1; k < line.length; k++) {
      const a = vertex(...line[k - 1]!), b = vertex(...line[k]!);
      if (a !== b) src.segments.push([a, b, c]);
    }
  }
}

for (const f of constellations.features) {
  const p = f.properties, [lon, dec] = f.geometry.coordinates;
  names.constellations.push({ id: f.id, en: clean(p.en || p.name), ar: clean(p.ar), ra: ra(lon), dec, rank: Number(p.rank) || 3 });
}

const bin = encodeSkyCatalog(src);
await Bun.write("public/sky/sky-v1.bin", bin);
await Bun.write("public/sky/names-v1.json", JSON.stringify(names));
console.log(
  `${src.stars.length} stars, ${names.stars.length} named, ${names.constellations.length} constellations, ` +
    `${src.vertices.length} figure vertices, ${src.segments.length} segments → sky-v1.bin ${bin.length} B`,
);
