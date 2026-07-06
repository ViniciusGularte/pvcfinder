const { hasSupabaseConfig, insertRows } = require("../../lib/supabaseServer");

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!hasSupabaseConfig()) {
    res.status(503).json({
      error: "Supabase is not configured yet.",
      details: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
    });
    return;
  }

  try {
    const body = await readJson(req);
    const playerName = String(body.playerName || "").trim();
    const itemId = String(body.itemId || "").trim();
    const itemName = String(body.itemName || "").trim();
    const targetPrice = Number(body.targetPrice);
    const subscription = body.subscription || {};

    if (!playerName || !itemId || !itemName || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      res.status(400).json({ error: "Missing playerName, itemId, itemName, or targetPrice." });
      return;
    }

    const keys = subscription.keys || {};
    const rows = await insertRows("price_watch_subscriptions", [
      {
        player_name: playerName,
        item_id: itemId,
        item_name: itemName,
        target_price: targetPrice,
        currency: "market",
        push_endpoint: subscription.endpoint || null,
        push_p256dh: keys.p256dh || null,
        push_auth: keys.auth || null,
        active: true,
      },
    ]);

    res.status(200).json({ ok: true, subscription: rows && rows[0] ? rows[0] : null });
  } catch (error) {
    res.status(500).json({
      error: "Failed to save watch subscription.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
