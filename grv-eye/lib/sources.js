// Player sources. Every adapter returns [{ name, uuid, world, x, y, z, yaw }]

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GRV-EYE map watcher', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`source returned HTTP ${res.status}`);
  return res.json();
}
const pick = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const clean = (list) => list.filter((p) => p && p.name && p.x != null && p.z != null);

function bluemap(cfg) {
  const ids = Object.keys(cfg.bluemap.maps);
  return {
    async fetch() {
      const results = await Promise.allSettled(
        ids.map((id) => getJSON(`${cfg.bluemap.base}maps/${id}/live/players.json`).then((d) => ({ id, d })))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) throw results[0]?.reason || new Error('no BlueMap maps responded');
      const out = [];
      for (const { id, d } of ok) {
        for (const p of d.players || []) {
          if (p.foreign) continue; // player is on another map
          out.push({
            name: String(p.name), uuid: p.uuid || null, world: id,
            x: num(p.position?.x), y: num(p.position?.y), z: num(p.position?.z),
            yaw: num(p.rotation?.yaw),
          });
        }
      }
      return clean(out);
    },
  };
}

function squaremap(cfg) {
  return {
    async fetch() {
      const d = await getJSON(cfg.url || `${cfg.squaremap.base}tiles/players.json`);
      return clean((d.players || []).map((p) => ({
        name: String(p.name), uuid: p.uuid || null, world: String(p.world || cfg.world),
        x: num(p.x), y: num(p.y), z: num(p.z), yaw: num(p.yaw),
      })));
    },
  };
}

function dynmap(cfg) {
  return {
    async fetch() {
      const d = await getJSON(cfg.url.replace('{ts}', Date.now()));
      return clean((d.players || []).map((p) => ({
        name: String(p.account || p.name), uuid: null, world: String(p.world),
        x: num(p.x), y: num(p.y), z: num(p.z), yaw: null,
      })));
    },
  };
}

function customJson(cfg) {
  const f = cfg.json;
  return {
    async fetch() {
      const d = await getJSON(cfg.url);
      const list = f.listPath ? pick(d, f.listPath) : d;
      if (!Array.isArray(list)) throw new Error(`JSON_LIST_PATH "${f.listPath}" is not an array`);
      return clean(list.map((p) => ({
        name: String(pick(p, f.name) ?? ''), uuid: null,
        world: String(pick(p, f.world) ?? cfg.world),
        x: num(pick(p, f.x)), y: null, z: num(pick(p, f.z)), yaw: null,
      })));
    },
  };
}

function demo() {
  const names = [
    'Steve_BR', 'kauan_gamer', 'xX_Creeper_Xx', 'LunaMiner', 'dudu_pvp', 'marina_exe',
    'ghost404', 'pedrinho_rs', 'Blaze_Kid', 'tia_redstone', 'Zezinho', 'Axolotl_Lord',
    'gaucho_miner', 'NetherNoite', 'bia_builds', 'Obsidiana', 'zumbi_fofo', 'RaioX',
  ];
  const hubs = [[0, 0], [620, -340], [-900, 480], [1500, 1200]];
  const ps = names.map((name, i) => {
    const [hx, hz] = hubs[i % hubs.length];
    return {
      name, uuid: `demo-${i}`, hub: [hx, hz],
      x: hx + (Math.random() - 0.5) * 400, z: hz + (Math.random() - 0.5) * 400,
      h: Math.random() * Math.PI * 2, speed: 2 + Math.random() * 6,
      online: Math.random() > 0.15, world: i % 7 === 6 ? 'world_nether' : 'world',
    };
  });
  return {
    async fetch() {
      for (const p of ps) {
        if (Math.random() < 0.01) p.online = !p.online;
        p.h += (Math.random() - 0.5) * 0.7;
        if (Math.hypot(p.hub[0] - p.x, p.hub[1] - p.z) > 450) p.h = Math.atan2(p.hub[1] - p.z, p.hub[0] - p.x) + (Math.random() - 0.5);
        p.x += Math.cos(p.h) * p.speed * 2.5;
        p.z += Math.sin(p.h) * p.speed * 2.5;
      }
      return ps.filter((p) => p.online).map((p) => ({
        name: p.name, uuid: p.uuid, world: p.world,
        x: Math.round(p.x * 10) / 10, y: 64, z: Math.round(p.z * 10) / 10,
        yaw: ((p.h * 180) / Math.PI - 90 + 360) % 360,
      }));
    },
  };
}

export function createSource(cfg) {
  if (['dynmap', 'json'].includes(cfg.type) && !cfg.url) {
    throw new Error(`SOURCE_TYPE=${cfg.type} needs SOURCE_URL in .env`);
  }
  switch (cfg.type) {
    case 'bluemap': return bluemap(cfg);
    case 'squaremap': return squaremap(cfg);
    case 'dynmap': return dynmap(cfg);
    case 'json': return customJson(cfg);
    case 'demo': return demo();
    default: throw new Error(`Unknown SOURCE_TYPE: ${cfg.type}`);
  }
}
