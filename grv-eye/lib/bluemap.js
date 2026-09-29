// BlueMap helpers: map discovery + lowres tile paths.
// BlueMap URL hash looks like  #minecraft_overworld;flat;x,y,z;zoom

const DEFAULT_LOWRES = { tileSize: [500, 500], lodFactor: 5, lodCount: 3 };

export const withSlash = (u) => (u.endsWith('/') ? u : u + '/');

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function discoverMaps(base, wanted = []) {
  let ids = wanted.length ? wanted : null;
  if (!ids) {
    try {
      const s = await getJSON(base + 'settings.json');
      if (Array.isArray(s.maps) && s.maps.length) ids = s.maps.map(String);
    } catch (err) {
      console.warn('[bluemap] could not read settings.json:', err.message);
    }
  }
  if (!ids) ids = ['minecraft_overworld'];

  const maps = {};
  await Promise.all(ids.map(async (id) => {
    const m = { id, name: id, lowres: { ...DEFAULT_LOWRES }, start: null };
    try {
      const s = await getJSON(`${base}maps/${id}/settings.json`);
      m.name = s.name || id;
      if (s.lowres) {
        m.lowres = {
          tileSize: s.lowres.tileSize || DEFAULT_LOWRES.tileSize,
          lodFactor: s.lowres.lodFactor || DEFAULT_LOWRES.lodFactor,
          lodCount: s.lowres.lodCount || DEFAULT_LOWRES.lodCount,
        };
      }
      if (Array.isArray(s.startPos)) m.start = s.startPos;
    } catch (err) {
      console.warn(`[bluemap] map "${id}": using default tile settings (${err.message})`);
    }
    maps[id] = m;
  }));
  return maps;
}
