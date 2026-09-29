// Skin resolver.
//  Java    → Mojang session server (by UUID, or name → UUID first)
//  Bedrock → Floodgate UUIDs look like 00000000-0000-0000-XXXX-XXXXXXXXXXXX where the
//            last 16 hex digits are the XUID. GeyserMC's global API maps XUID → skin.
//            Without a UUID, a name with a Floodgate prefix (".", "*") is looked up by gamertag.
//  Fallback → default Steve skin.

const UA = 'GRV-EYE skin resolver';
const TTL = 6 * 3600_000;
const TTL_DEFAULT = 30 * 60_000;
const STEVE = 'https://mc-heads.net/skin/MHF_Steve';

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function getBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
function decodeTextures(b64) {
  try {
    const t = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const s = t.textures?.SKIN;
    if (!s?.url) return null;
    return { url: s.url.replace(/^http:/, 'https:'), model: s.metadata?.model === 'slim' ? 'slim' : 'default' };
  } catch { return null; }
}

export const isFloodgateUuid = (u) => /^0{16}0009/i.test(String(u || '').replace(/-/g, ''));
const xuidFromUuid = (u) => BigInt('0x' + u.replace(/-/g, '').slice(16)).toString();

async function bedrockByXuid(xuid) {
  const d = await getJSON(`https://api.geysermc.org/v2/skin/${xuid}`);
  if (!d?.texture_id) return null;
  const t = d.value ? decodeTextures(d.value) : null;
  return { url: `https://textures.minecraft.net/texture/${d.texture_id}`, model: t?.model || 'default' };
}

async function javaUuidByName(name) {
  const a = await getJSON(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`).catch(() => null);
  if (a?.id) return a.id;
  const b = await getJSON(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`).catch(() => null);
  return b?.id || null;
}

export function createSkinResolver({ prefixes = ['.', '*'], lookupUuid = () => null } = {}) {
  const cache = new Map();
  const inflight = new Map();

  async function resolve(name) {
    const uuid = lookupUuid(name);
    const prefix = prefixes.find((p) => p && name.startsWith(p));

    if (isFloodgateUuid(uuid)) {
      const s = await bedrockByXuid(xuidFromUuid(uuid)).catch(() => null);
      return { edition: 'bedrock', ...(s || {}) };
    }
    if (prefix && !uuid) {
      const d = await getJSON(`https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(name.slice(prefix.length))}`).catch(() => null);
      if (d?.xuid) {
        const s = await bedrockByXuid(d.xuid).catch(() => null);
        return { edition: 'bedrock', ...(s || {}) };
      }
    }
    const id = uuid ? uuid.replace(/-/g, '') : await javaUuidByName(name);
    if (id) {
      const p = await getJSON(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`).catch(() => null);
      const v = p?.properties?.find((x) => x.name === 'textures')?.value;
      const t = v && decodeTextures(v);
      if (t) return { edition: 'java', ...t };
    }
    return { edition: prefix ? 'bedrock' : 'java' };
  }

  async function load(name) {
    const r = await resolve(name);
    let buf, source = 'player', model = r.model || 'default';
    try {
      if (!r.url) throw new Error('no skin');
      buf = await getBuffer(r.url);
    } catch {
      buf = await getBuffer(STEVE);
      source = 'default';
      model = 'default';
    }
    const entry = { buf, model, edition: r.edition, source, at: Date.now() };
    cache.set(name, entry);
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return entry;
  }

  return async function getSkin(name) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < (hit.source === 'default' ? TTL_DEFAULT : TTL)) return hit;
    if (!inflight.has(name)) inflight.set(name, load(name).finally(() => inflight.delete(name)));
    return inflight.get(name);
  };
}
