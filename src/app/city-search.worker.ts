import type { CityResult } from './CitySearch';

type CityRow = [number, string, string, string[], number, number, string, string, number];
interface CityIndex {
  version: number;
  countries: Record<string, string>;
  admins: Record<string, string>;
  cities: CityRow[];
}
interface SearchableCity {
  row: CityRow;
  names: string[];
  region: string;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; query: string }>) => void) | null;
  postMessage: (message: { id: number; cities?: CityResult[]; error?: string }) => void;
};
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
    .trim();
const countryNames = new Intl.DisplayNames(['zh-CN', 'en'], { type: 'region' });
const countryLabel = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? countryNames.of(code) : undefined;
let indexPromise: Promise<{ index: CityIndex; cities: SearchableCity[] }> | undefined;

async function loadIndex() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  const base = `${import.meta.env.BASE_URL}search/cities.json`;
  const read = async (compressed: boolean): Promise<CityIndex> => {
    const response = await fetch(`${base}${compressed ? '.gz' : ''}?snapshot=2026-10-04`, {
      signal: controller.signal,
      cache: 'force-cache',
    });
    if (!response.ok || !response.body) throw new Error('City index unavailable');
    if (!compressed || response.headers.get('content-encoding')?.includes('gzip'))
      return response.json();
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  };
  try {
    let index: CityIndex;
    if (typeof DecompressionStream === 'function') {
      try {
        index = await read(true);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        index = await read(false);
      }
    } else index = await read(false);
    if (index.version !== 1 || !Array.isArray(index.cities)) throw new Error('Invalid city index');
    return {
      index,
      cities: index.cities.map((row) => ({
        row,
        names: row[3].map(normalize),
        region: normalize(
          `${index.admins[row[7]] ?? ''} ${index.countries[row[6]] ?? ''} ${countryLabel(row[6]) ?? ''} ${row[6]}`,
        ),
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

scope.onmessage = async ({ data: { id, query } }) => {
  try {
    indexPromise ??= loadIndex().catch((error) => {
      indexPromise = undefined;
      throw error;
    });
    const { index, cities } = await indexPromise;
    const text = normalize(query);
    if (!text) {
      scope.postMessage({ id, cities: [] });
      return;
    }
    const tokens = text.split(' ');
    const matches: { row: CityRow; score: number; alias: number }[] = [];
    for (const city of cities) {
      let score = 0;
      let alias = 0;
      for (let i = 0; i < city.names.length; i++) {
        const name = city.names[i];
        const candidate =
          name === text
            ? 4
            : name.startsWith(text)
              ? 3
              : name.includes(text)
                ? 2
                : tokens.some((token) => name.includes(token)) &&
                    tokens.every((token) => name.includes(token) || city.region.includes(token))
                  ? 1
                  : 0;
        if (candidate > score) {
          score = candidate;
          alias = i;
        }
      }
      if (score) matches.push({ row: city.row, score, alias });
    }
    matches.sort((a, b) => b.score - a.score || b.row[8] - a.row[8] || a.row[0] - b.row[0]);
    scope.postMessage({
      id,
      cities: matches.slice(0, 12).map(({ row, alias }): CityResult => ({
        id: row[0],
        name: row[1],
        matchedName: row[3][alias],
        admin: index.admins[row[7]] ?? '行政区未提供',
        country: countryLabel(row[6]) ?? index.countries[row[6]] ?? row[6],
        countryCode: row[6],
        latitude: row[4],
        longitude: row[5],
      })),
    });
  } catch {
    scope.postMessage({ id, error: '城市索引暂时无法读取' });
  }
};
