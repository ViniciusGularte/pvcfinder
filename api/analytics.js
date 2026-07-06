const { hasSupabaseConfig, selectRows } = require("../lib/supabaseServer");

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function average(values) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (!safeValues.length) {
    return null;
  }
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function groupBy(rows, getKey) {
  return rows.reduce((groups, row) => {
    const key = getKey(row);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(row);
    return groups;
  }, {});
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", "https://pvc.local");
  const itemId = url.searchParams.get("itemId") || url.searchParams.get("item");
  const requestedDays = Number(url.searchParams.get("days"));
  const days = Math.max(2, Math.min(30, Number.isFinite(requestedDays) ? requestedDays : 30));

  if (!itemId) {
    res.status(400).json({ error: "Missing itemId." });
    return;
  }

  if (!hasSupabaseConfig()) {
    res.status(200).json({
      configured: false,
      itemId,
      days,
      message: "Supabase env vars are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
      summary: null,
      daily: [],
      stores: [],
      rows: [],
    });
    return;
  }

  try {
    const encodedItem = encodeURIComponent(itemId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const rows = await selectRows(
      "price_snapshots",
      "item_id=eq." +
        encodedItem +
        "&snapshot_date=gte." +
        encodeURIComponent(toDateOnly(startDate)) +
        "&select=item_id,item_name,store_name,price,stock,available,snapshot_date,created_at&order=snapshot_date.desc,price.asc&limit=1000",
    );

    const prices = rows.map((row) => Number(row.price)).filter(Number.isFinite);
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const recent7 = rows.filter((row) => row.snapshot_date >= toDateOnly(sevenDaysAgo));
    const recent30 = rows.filter((row) => row.snapshot_date >= toDateOnly(thirtyDaysAgo));
    const dailyGroups = groupBy(rows, (row) => row.snapshot_date);
    const storeGroups = groupBy(rows, (row) => row.store_name || "Unknown Store");

    const daily = Object.entries(dailyGroups)
      .map(([date, dateRows]) => {
        const datePrices = dateRows.map((row) => Number(row.price)).filter(Number.isFinite);
        return {
          date,
          low: datePrices.length ? Math.min(...datePrices) : null,
          high: datePrices.length ? Math.max(...datePrices) : null,
          average: average(datePrices),
          stores: dateRows.length,
          availableStores: dateRows.filter((row) => row.available).length,
        };
      })
      .sort((left, right) => left.date.localeCompare(right.date));

    const stores = Object.entries(storeGroups)
      .map(([storeName, storeRows]) => {
        const storePrices = storeRows.map((row) => Number(row.price)).filter(Number.isFinite);
        return {
          storeName,
          low: storePrices.length ? Math.min(...storePrices) : null,
          average: average(storePrices),
          daysAvailable: new Set(
            storeRows.filter((row) => row.available).map((row) => row.snapshot_date),
          ).size,
          samples: storeRows.length,
        };
      })
      .sort((left, right) => {
        const leftAvg = Number.isFinite(left.average) ? left.average : Number.POSITIVE_INFINITY;
        const rightAvg = Number.isFinite(right.average) ? right.average : Number.POSITIVE_INFINITY;
        return leftAvg - rightAvg;
      });

    const fastestGone = stores
      .slice()
      .sort((left, right) => left.daysAvailable - right.daysAvailable)
      .slice(0, 5);

    res.status(200).json({
      configured: true,
      itemId,
      days,
      itemName: rows[0] ? rows[0].item_name : "",
      summary: {
        currentPrice: daily.length ? daily[daily.length - 1].low : null,
        historicalLow: prices.length ? Math.min(...prices) : null,
        historicalHigh: prices.length ? Math.max(...prices) : null,
        average7d: average(recent7.map((row) => Number(row.price))),
        average30d: average(recent30.map((row) => Number(row.price))),
        storesSelling: rows.filter((row) => row.available).length
          ? new Set(rows.filter((row) => row.available).map((row) => row.store_name)).size
          : 0,
        cheapestStore: stores[0] ? stores[0].storeName : "",
        fastestGoneStore: fastestGone[0] ? fastestGone[0].storeName : "",
      },
      daily,
      stores,
      fastestGone,
      rows,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load analytics.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
