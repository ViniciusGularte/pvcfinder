const {
  CRON_SECRET,
  hasPushConfig,
  hasSupabaseConfig,
  selectRows,
} = require("../../lib/supabaseServer");

function getBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function hasCronAuth(req) {
  if (!CRON_SECRET) {
    return true;
  }
  const url = new URL(req.url || "/", "https://pvc.local");
  return (url.searchParams.get("secret") || getBearer(req)) === CRON_SECRET;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!hasCronAuth(req)) {
    res.status(401).json({ error: "Invalid cron secret." });
    return;
  }

  const supabaseConfigured = hasSupabaseConfig();
  const pushConfigured = hasPushConfig();

  if (!supabaseConfigured) {
    res.status(200).json({
      ok: true,
      supabaseConfigured,
      pushConfigured,
      snapshots: {
        recent: [],
        latestDate: null,
      },
      message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
    return;
  }

  try {
    const recent = await selectRows(
      "price_snapshots",
      "select=item_id,item_name,store_name,price,stock,available,snapshot_date,created_at&order=created_at.desc&limit=5",
    );

    res.status(200).json({
      ok: true,
      supabaseConfigured,
      pushConfigured,
      snapshots: {
        recent,
        latestDate: recent && recent[0] ? recent[0].snapshot_date : null,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      supabaseConfigured,
      pushConfigured,
      error: "Failed to read cron status.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
