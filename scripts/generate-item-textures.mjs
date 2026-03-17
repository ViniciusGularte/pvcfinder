import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const snapshotPath = path.join(rootDir, "data", "shops-snapshot.json");
const outputPath = path.join(rootDir, "data", "item-textures.js");

const MC_ASSET_VERSION = "1.21.8";
const MC_ASSET_TEXTURE_BASE =
  "https://assets.mcasset.cloud/" +
  MC_ASSET_VERSION +
  "/assets/minecraft/textures";

const textureAliasMap = {
  CLOCK: ["item/clock_00"],
  COMPASS: ["item/compass_00"],
  CROSSBOW: ["item/crossbow_standby"],
  ENCHANTED_GOLDEN_APPLE: ["item/golden_apple"],
  MOSS_CARPET: ["block/moss_block"],
  RECOVERY_COMPASS: ["item/recovery_compass_00"],
  STICKY_PISTON: ["block/piston_top_sticky"],
  TIPPED_ARROW: ["item/tipped_arrow_head"],
  CARTOGRAPHY_TABLE: ["block/cartography_table_side1"],
  CHISELED_BOOKSHELF: ["block/chiseled_bookshelf_empty"],
};

const blockVariantSuffixes = [
  "side",
  "front",
  "top",
  "bottom",
  "end",
  "back",
  "base",
  "sides",
  "round",
  "empty",
  "occupied",
  "input_side",
];

const itemVariantSuffixes = ["standby", "base", "00"];

const textureValidationCache = new Map();

function addRelativeCandidates(store, textureKey) {
  if (!textureKey) {
    return;
  }

  store.add("item/" + textureKey);
  store.add("block/" + textureKey);

  itemVariantSuffixes.forEach((suffix) => {
    store.add("item/" + textureKey + "_" + suffix);
  });

  blockVariantSuffixes.forEach((suffix) => {
    store.add("block/" + textureKey + "_" + suffix);
  });
}

function buildDerivedTextureKeys(textureKey) {
  const derivedKeys = new Set([textureKey]);

  if (/_block$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_block$/, ""));
  }

  if (/_(slab|stairs)$/.test(textureKey)) {
    const baseKey = textureKey.replace(/_(slab|stairs)$/, "");
    derivedKeys.add(baseKey);
    derivedKeys.add(baseKey + "s");
  }

  if (/_carpet$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_carpet$/, "_wool"));
  }

  if (/_bed$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_bed$/, "_wool"));
  }

  if (/_banner$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_banner$/, "_wool"));
  }

  if (/_stained_glass_pane$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_pane$/, ""));
  }

  if (/_button$/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/_button$/, "_planks"));
  }

  if (/^smooth_/.test(textureKey)) {
    derivedKeys.add(textureKey.replace(/^smooth_/, ""));
  }

  return Array.from(derivedKeys);
}

function buildTextureCandidates(type) {
  const safeType = String(type || "").trim().toUpperCase();
  if (!safeType) {
    return [];
  }

  const textureKey = safeType.toLowerCase();
  const relativeCandidates = new Set(textureAliasMap[safeType] || []);

  buildDerivedTextureKeys(textureKey).forEach((candidateKey) => {
    addRelativeCandidates(relativeCandidates, candidateKey);
  });

  return Array.from(relativeCandidates).map(
    (relativePath) => MC_ASSET_TEXTURE_BASE + "/" + relativePath + ".png",
  );
}

async function isValidTextureUrl(url) {
  if (textureValidationCache.has(url)) {
    return textureValidationCache.get(url);
  }

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "user-agent": "PVCFinderTextureResolver/1.0",
      },
    });

    if (!response.ok) {
      textureValidationCache.set(url, false);
      return false;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isValid = contentType.startsWith("image/");
    textureValidationCache.set(url, isValid);
    return isValid;
  } catch (error) {
    textureValidationCache.set(url, false);
    return false;
  }
}

async function resolveTextureUrl(type) {
  for (const url of buildTextureCandidates(type)) {
    if (await isValidTextureUrl(url)) {
      return url;
    }
  }

  return null;
}

function collectTypes(snapshot) {
  const types = new Set();

  for (const shop of snapshot.data || []) {
    for (const recipe of shop.recipes || []) {
      for (const item of [recipe.item1, recipe.item2, recipe.resultItem]) {
        if (item && item.type) {
          types.add(String(item.type).trim().toUpperCase());
        }
      }
    }
  }

  return [...types].sort();
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  const types = collectTypes(snapshot);
  const textureMap = {};
  const unresolved = [];
  let cursor = 0;
  const workerCount = 16;

  async function worker() {
    while (cursor < types.length) {
      const index = cursor;
      cursor += 1;
      const type = types[index];
      const resolved = await resolveTextureUrl(type);

      if (resolved) {
        textureMap[type] = resolved;
      } else {
        unresolved.push(type);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const orderedMap = Object.fromEntries(
    Object.entries(textureMap).sort(([left], [right]) => left.localeCompare(right)),
  );

  const resolvedCount = Object.keys(orderedMap).length;
  const minimumResolvedCount = Math.min(
    types.length,
    Math.max(10, Math.floor(types.length * 0.25)),
  );

  if (resolvedCount < minimumResolvedCount) {
    throw new Error(
      "Resolved only " +
        resolvedCount +
        " of " +
        types.length +
        " textures. Aborting so the existing map is not overwritten by a likely network failure.",
    );
  }

  const contents =
    "window.PVC_ITEM_TEXTURES = " +
    JSON.stringify(orderedMap, null, 2) +
    ";\n";

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, contents, "utf8");

  console.log(
    "Resolved " +
      resolvedCount +
      " of " +
      types.length +
      " item textures for MC Assets " +
      MC_ASSET_VERSION,
  );

  if (unresolved.length) {
    console.log("Unresolved types:");
    unresolved.forEach((type) => console.log("- " + type));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
