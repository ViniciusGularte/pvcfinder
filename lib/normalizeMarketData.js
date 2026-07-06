const LIVE_DATA_URL = "https://web.peacefulvanilla.club/shops/data.json";

const currencyUnitMap = {
  EMERALD: { base: "emerald", factor: 1 },
  EMERALD_BLOCK: { base: "emerald", factor: 9 },
  DIAMOND: { base: "diamond", factor: 1 },
  DIAMOND_BLOCK: { base: "diamond", factor: 9 },
  NETHERITE_INGOT: { base: "netherite", factor: 1 },
  ANCIENT_DEBRIS: { base: "debris", factor: 1 },
  GOLD_INGOT: { base: "gold", factor: 1 },
  GOLD_BLOCK: { base: "gold", factor: 9 },
  IRON_INGOT: { base: "iron", factor: 1 },
};

function cleanText(value) {
  return String(value || "")
    .replace(/§[0-9A-FK-OR]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLore(lore) {
  return Array.isArray(lore) ? lore.map(cleanText).filter(Boolean) : [];
}

function normalizeForSearch(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function formatType(type) {
  return String(type || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function romanize(value) {
  const numerals = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X" };
  return numerals[value] || (value ? String(value) : "");
}

function looksLikeItemType(value) {
  return /^[A-Z0-9_ ]+$/.test(String(value || ""));
}

function numberOrZero(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function buildExactLabelList(values) {
  const seen = new Set();
  return values.filter(Boolean).reduce((labels, value) => {
    const cleaned = cleanText(value);
    const normalized = normalizeForSearch(cleaned);
    if (!cleaned || !normalized || seen.has(normalized)) {
      return labels;
    }
    seen.add(normalized);
    labels.push(cleaned);
    return labels;
  }, []);
}

function parseShulkerContents(lore) {
  return cleanLore(lore)
    .map((line) => {
      const match = line.match(/^-+\s*(\d+)\s*x\s*(.+)$/i);
      if (!match) {
        return null;
      }
      const amount = numberOrZero(match[1]);
      const rawName = match[2].trim();
      const name = looksLikeItemType(rawName) ? formatType(rawName) : rawName;
      const matchLabels = buildExactLabelList([name, formatType(rawName), rawName]);
      return {
        amount,
        rawName,
        name,
        rawKey: normalizeForSearch(rawName),
        matchLabels,
      };
    })
    .filter(Boolean);
}

function getApproxItemMaxStack(rawName) {
  const normalized = normalizeForSearch(rawName).replace(/\s+/g, "_");
  const stack16 = new Set([
    "egg",
    "ender_pearl",
    "snowball",
    "bucket",
    "water_bucket",
    "lava_bucket",
    "milk_bucket",
    "powder_snow_bucket",
    "honey_bottle",
    "potion",
    "splash_potion",
    "lingering_potion",
  ]);
  const stack1Matchers = [
    /_sword$/,
    /_pickaxe$/,
    /_axe$/,
    /_shovel$/,
    /_hoe$/,
    /_helmet$/,
    /_chestplate$/,
    /_leggings$/,
    /_boots$/,
    /^elytra$/,
    /_bow$/,
    /^bow$/,
    /^crossbow$/,
    /^shield$/,
    /^trident$/,
    /^totem_of_undying$/,
    /^fishing_rod$/,
    /^saddle$/,
    /^minecart$/,
    /_minecart$/,
    /^boat$/,
    /_boat$/,
    /^chest_boat$/,
    /_chest_boat$/,
    /^enchanted_book$/,
  ];
  if (stack16.has(normalized)) {
    return 16;
  }
  return stack1Matchers.some((matcher) => matcher.test(normalized)) ? 1 : 64;
}

function getUniformShulkerFill(shulkerContents) {
  if (!Array.isArray(shulkerContents) || shulkerContents.length !== 1) {
    return null;
  }
  const entry = shulkerContents[0];
  const maxStack = getApproxItemMaxStack(entry.rawName || entry.name);
  const capacity = 27 * maxStack;
  return entry.amount >= capacity ? { name: entry.name, amount: entry.amount } : null;
}

function isGenericShulkerName(value) {
  const normalized = normalizeForSearch(value);
  return normalized === "shulker box" || normalized.endsWith(" shulker box");
}

function formatEnchants(enchantObject) {
  if (!enchantObject || typeof enchantObject !== "object") {
    return [];
  }
  return Object.entries(enchantObject).map(([key, value]) => {
    const base = key.replace(/^minecraft:/, "").replace(/_/g, " ");
    const label = titleCase(base);
    const numeral = romanize(value);
    return numeral ? label + " " + numeral : label;
  });
}

function buildEnchantKey(enchantObject) {
  if (!enchantObject || typeof enchantObject !== "object") {
    return "";
  }
  return Object.entries(enchantObject)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => key + ":" + value)
    .join("|");
}

function buildListingDisplayName(item, enchants, shulkerContents) {
  const customName = cleanText(item && item.name);
  if (String((item && item.type) || "").includes("SHULKER")) {
    if (Array.isArray(shulkerContents) && shulkerContents.length === 1) {
      return "Shulker of " + shulkerContents[0].name;
    }
    const uniformFill = getUniformShulkerFill(shulkerContents);
    if (uniformFill) {
      return "Shulker of " + uniformFill.name;
    }
  }
  if (customName && !isGenericShulkerName(customName)) {
    return customName;
  }
  if (customName) {
    return customName;
  }
  return formatType(item && item.type) || (Array.isArray(enchants) && enchants.length ? enchants.join(", ") : "Unknown Item");
}

function buildMarketKey(details) {
  const typeKey = normalizeForSearch(details.type);
  const enchantKey = details.enchantKey || "";
  if (details.shulkerContents.length) {
    const contentKey = details.shulkerContents
      .map((entry) => entry.rawKey + ":" + entry.amount)
      .join("|");
    return ["shulker", contentKey, enchantKey].join("::");
  }
  return [typeKey, normalizeForSearch(details.displayName), enchantKey].join("::");
}

function getCurrencyMeta(type) {
  return currencyUnitMap[String(type || "")] || null;
}

function buildPaymentPart(item) {
  const type = String((item && item.type) || "");
  const amount = numberOrZero(item && item.amount) || 1;
  const meta = getCurrencyMeta(type);
  return {
    type,
    amount,
    currencyBase: meta ? meta.base : null,
    currencyUnits: meta ? amount * meta.factor : 0,
    label: amount + " " + (cleanText(item && item.name) || formatType(type)),
  };
}

function median(values) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function addNumberCandidate(store, key, value) {
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  if (!store[key]) {
    store[key] = [];
  }
  store[key].push(value);
}

function computePaymentMarketValue(paymentParts, currencyValues) {
  if (!Array.isArray(paymentParts) || !paymentParts.length) {
    return null;
  }
  let total = 0;
  for (const part of paymentParts) {
    if (!part.currencyBase) {
      return null;
    }
    const baseValue = currencyValues[part.currencyBase];
    if (!Number.isFinite(baseValue)) {
      return null;
    }
    total += part.currencyUnits * baseValue;
  }
  return total;
}

function getSingleCurrencyQuote(paymentParts) {
  let base = null;
  let units = 0;
  for (const part of paymentParts || []) {
    if (!part.currencyBase) {
      return null;
    }
    if (!base) {
      base = part.currencyBase;
    }
    if (part.currencyBase !== base) {
      return null;
    }
    units += part.currencyUnits;
  }
  return base ? { base, units } : null;
}

function buildProductStats(listings, currencyValues) {
  const groups = {};
  listings.forEach((listing) => {
    const paymentMarketValue = computePaymentMarketValue(listing.paymentParts, currencyValues);
    if (!Number.isFinite(paymentMarketValue) || listing.outputUnits <= 0) {
      return;
    }
    addNumberCandidate(groups, listing.itemId, paymentMarketValue / listing.outputUnits);
  });
  return Object.entries(groups).reduce((stats, [key, values]) => {
    const sorted = values.slice().sort((left, right) => left - right);
    const sum = sorted.reduce((total, value) => total + value, 0);
    stats[key] = {
      count: sorted.length,
      median: median(sorted),
      average: sum / sorted.length,
      low: sorted[0],
      high: sorted[sorted.length - 1],
    };
    return stats;
  }, {});
}

function buildMarketContext(listings) {
  const currencyValues = { emerald: 1 };
  let productStats = buildProductStats(listings, currencyValues);
  for (let pass = 0; pass < 12; pass += 1) {
    const candidates = {};
    listings.forEach((listing) => {
      const stats = productStats[listing.itemId];
      if (!stats || !Number.isFinite(stats.median)) {
        return;
      }
      if (listing.resultCurrencyBase && listing.resultCurrencyFactor > 0) {
        addNumberCandidate(candidates, listing.resultCurrencyBase, stats.median / listing.resultCurrencyFactor);
      }
      const quote = getSingleCurrencyQuote(listing.paymentParts);
      if (quote && listing.outputUnits > 0) {
        addNumberCandidate(candidates, quote.base, stats.median / (quote.units / listing.outputUnits));
      }
    });
    let changed = false;
    Object.entries(candidates).forEach(([base, values]) => {
      if (base === "emerald") {
        currencyValues.emerald = 1;
        return;
      }
      const nextValue = median(values);
      if (!Number.isFinite(nextValue) || nextValue <= 0) {
        return;
      }
      const previous = currencyValues[base];
      if (!Number.isFinite(previous) || Math.abs(previous - nextValue) / nextValue > 0.02) {
        changed = true;
      }
      currencyValues[base] = nextValue;
    });
    currencyValues.emerald = 1;
    productStats = buildProductStats(listings, currencyValues);
    if (!changed) {
      break;
    }
  }
  return { currencyValues, productStats };
}

function normalizeMarketData(payload) {
  const rows = [];
  const shops = Array.isArray(payload && payload.data) ? payload.data : [];
  shops.forEach((shop, shopIndex) => {
    const recipes = Array.isArray(shop.recipes) ? shop.recipes : [];
    recipes.forEach((recipe, recipeIndex) => {
      if (!recipe || !recipe.resultItem) {
        return;
      }
      const resultItem = recipe.resultItem;
      const shulkerContents = parseShulkerContents(resultItem.lore);
      const enchants = formatEnchants(resultItem.enchant);
      const displayName = buildListingDisplayName(resultItem, enchants, shulkerContents);
      const enchantKey = buildEnchantKey(resultItem.enchant);
      const itemId = buildMarketKey({
        type: resultItem.type || "",
        displayName,
        enchantKey,
        shulkerContents,
      });
      const resultCurrency = getCurrencyMeta(resultItem.type);
      const outputUnits = Math.max(numberOrZero(resultItem.amount) || 1, 1);
      const payments = [recipe.item1, recipe.item2].filter(Boolean).map(buildPaymentPart);
      const offerStock = numberOrZero(recipe.stock);
      rows.push({
        localId: "card-" + shopIndex + "-" + recipeIndex,
        itemId,
        itemName: displayName,
        itemType: resultItem.type || "",
        storeId: [cleanText(shop.shopOwner), cleanText(shop.shopName)].filter(Boolean).join("::"),
        storeName: cleanText(shop.shopName) || "Unnamed Shop",
        storeOwner: cleanText(shop.shopOwner) || "Unknown Seller",
        stock: offerStock,
        available: offerStock > 0,
        outputUnits,
        resultCurrencyBase: resultCurrency ? resultCurrency.base : null,
        resultCurrencyFactor: resultCurrency ? resultCurrency.factor : 0,
        paymentParts: payments,
        rawData: { shop, recipe },
        price: null,
        unitPrice: null,
      });
    });
  });
  const marketContext = buildMarketContext(rows);
  rows.forEach((row) => {
    const price = computePaymentMarketValue(row.paymentParts, marketContext.currencyValues);
    row.price = Number.isFinite(price) ? price : null;
    row.unitPrice = Number.isFinite(price) && row.outputUnits > 0 ? price / row.outputUnits : null;
  });
  return { rows, marketContext };
}

async function fetchLiveMarketData() {
  const response = await fetch(LIVE_DATA_URL, {
    headers: {
      accept: "application/json,text/plain,*/*",
      referer: "https://web.peacefulvanilla.club/",
      origin: "https://web.peacefulvanilla.club",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "Mozilla/5.0 (compatible; PVCShopBrowser/1.0; +https://web.peacefulvanilla.club/)",
    },
  });
  if (!response.ok) {
    throw new Error("PVC upstream returned " + response.status);
  }
  return response.json();
}

module.exports = {
  LIVE_DATA_URL,
  fetchLiveMarketData,
  normalizeMarketData,
};
