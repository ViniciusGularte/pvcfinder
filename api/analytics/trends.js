const { hasSupabaseConfig, selectRows } = require("../../lib/supabaseServer");

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

function buildTrendRows(rows) {
  const byItem = groupBy(rows, (row) => row.item_id);

  return Object.entries(byItem)
    .map(([itemId, itemRows]) => {
      const byDay = groupBy(itemRows, (row) => row.snapshot_date);
      const daily = Object.entries(byDay)
        .map(([date, dayRows]) => {
          const prices = dayRows.map((row) => Number(row.price)).filter(Number.isFinite);
          return {
            date,
            low: prices.length ? Math.min(...prices) : null,
            average: average(prices),
            samples: prices.length,
          };
        })
        .filter((day) => Number.isFinite(day.low))
        .sort((left, right) => left.date.localeCompare(right.date));

      if (daily.length < 2) {
        return null;
      }

      const first = daily[0];
      const last = daily[daily.length - 1];
      if (!Number.isFinite(first.low) || !Number.isFinite(last.low) || first.low <= 0) {
        return null;
      }

      const change = last.low - first.low;
      const changePercent = change / first.low;
      return {
        itemId,
        itemName: itemRows[0] ? itemRows[0].item_name : itemId,
        firstPrice: first.low,
        lastPrice: last.low,
        change,
        changePercent,
        days: daily.length,
        daily,
      };
    })
    .filter(Boolean)
    .filter((row) => row.days >= 2);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", "https://pvc.local");
  const requestedDays = Number(url.searchParams.get("days"));
  const days = Math.max(2, Math.min(30, Number.isFinite(requestedDays) ? requestedDays : 30));

  if (!hasSupabaseConfig()) {
    res.status(200).json({
      configured: false,
      days,
      rising: [],
      falling: [],
      message: "Supabase env vars are missing. Trend charts need saved snapshots.",
    });
    return;
  }

  try {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const rows = await selectRows(
      "price_snapshots",
      "snapshot_date=gte." +
        encodeURIComponent(toDateOnly(start)) +
        "&select=item_id,item_name,price,snapshot_date,available&available=eq.true&order=snapshot_date.asc&limit=10000",
    );
    const trendRows = buildTrendRows(rows || []);
    const rising = trendRows
      .filter((row) => row.change > 0)
      .sort((left, right) => right.changePercent - left.changePercent)
      .slice(0, 8);
    const falling = trendRows
      .filter((row) => row.change < 0)
      .sort((left, right) => left.changePercent - right.changePercent)
      .slice(0, 8);

    res.status(200).json({
      configured: true,
      days,
      rising,
      falling,
      rows: trendRows.length,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load analytics trends.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
