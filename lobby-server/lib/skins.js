const UA = "PVC Lobby skin resolver";
const TTL = 6 * 3600_000;
const TTL_DEFAULT = 30 * 60_000;
const STEVE = "https://mc-heads.net/skin/MHF_Steve";

async function getJSON(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function getBuffer(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function decodeTextures(base64) {
  try {
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    const skin = payload.textures?.SKIN;
    if (!skin?.url) return null;
    return {
      url: skin.url.replace(/^http:/, "https:"),
      model: skin.metadata?.model === "slim" ? "slim" : "default",
    };
  } catch {
    return null;
  }
}

async function javaUuidByName(name) {
  const profile = await getJSON(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
  ).catch(() => null);
  return profile?.id || null;
}

async function resolve(name) {
  const id = await javaUuidByName(name);
  if (!id) return null;
  const profile = await getJSON(
    `https://sessionserver.mojang.com/session/minecraft/profile/${id}`,
  ).catch(() => null);
  const encoded = profile?.properties?.find(
    (property) => property.name === "textures",
  )?.value;
  return encoded ? decodeTextures(encoded) : null;
}

export function createSkinResolver() {
  const cache = new Map();
  const inflight = new Map();

  async function load(name) {
    const resolved = await resolve(name);
    let buffer;
    let source = "player";
    try {
      if (!resolved?.url) throw new Error("No player skin");
      buffer = await getBuffer(resolved.url);
    } catch {
      buffer = await getBuffer(STEVE);
      source = "default";
    }
    const entry = { buf: buffer, source, at: Date.now() };
    cache.set(name, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return entry;
  }

  return async function getSkin(name) {
    const cached = cache.get(name);
    const ttl = cached?.source === "default" ? TTL_DEFAULT : TTL;
    if (cached && Date.now() - cached.at < ttl) return cached;
    if (!inflight.has(name)) {
      inflight.set(name, load(name).finally(() => inflight.delete(name)));
    }
    return inflight.get(name);
  };
}
