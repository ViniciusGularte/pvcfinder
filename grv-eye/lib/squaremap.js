// Squaremap discovery for the LiveAtlas-compatible public endpoint.

export const withSlash = (url) => (url.endsWith('/') ? url : `${url}/`);

async function getJSON(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'GRV-EYE map watcher', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const friendlyName = (world) => {
  const type = String(world.type || '').toLowerCase();
  const id = String(world.name || '');
  if (type === 'normal' || id.endsWith('_overworld')) return 'Overworld';
  if (type === 'nether' || id.endsWith('_the_nether') || id.endsWith('_nether')) return 'Nether';
  if (type === 'the_end' || id.endsWith('_the_end')) return 'The End';
  return String(world.display_name || id).replace(/^minecraft:/, '').replaceAll('_', ' ');
};

export async function discoverSquaremap(base, wanted = []) {
  const root = withSlash(base);
  const settings = await getJSON(`${root}tiles/settings.json`);
  const allowed = new Set(wanted);
  const listed = Array.isArray(settings.worlds) ? settings.worlds : [];
  const selected = wanted.length ? listed.filter((w) => allowed.has(String(w.name))) : listed;
  if (!selected.length) throw new Error('Squaremap did not expose any requested worlds');

  const entries = await Promise.all(selected.map(async (world) => {
    const id = String(world.name);
    const config = await getJSON(`${root}tiles/${encodeURIComponent(id)}/settings.json`);
    return [id, {
      id,
      name: friendlyName(world),
      start: config.spawn && Number.isFinite(config.spawn.x) && Number.isFinite(config.spawn.z)
        ? [config.spawn.x, config.spawn.z]
        : null,
      tileSize: 512,
      maxZoom: Math.max(0, Number(config.zoom?.max) || 0),
      extraZoom: Math.max(0, Number(config.zoom?.extra) || 0),
    }];
  }));
  return Object.fromEntries(entries);
}
