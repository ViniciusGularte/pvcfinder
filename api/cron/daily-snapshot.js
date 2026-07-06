const { CRON_SECRET, hasSupabaseConfig, insertRows, selectRows, updateRows } = require("../../lib/supabaseServer");
const { fetchLiveMarketData, normalizeMarketData } = require("../../lib/normalizeMarketData");
const { sendPushNotification } = require("../../lib/sendPushNotification");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function chunk(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function getBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function getTriggerInfo(req) {
  return {
    userAgent: req.headers["user-agent"] || req.headers["User-Agent"] || "",
    vercelCronSchedule:
      req.headers["x-vercel-cron-schedule"] || req.headers["X-Vercel-Cron-Schedule"] || "",
    hasAuthorizationHeader: Boolean(req.headers.authorization || req.headers.Authorization),
  };
}

async function saveSnapshots(rows, snapshotDate) {
  const payload = rows.map((row) => ({
    item_id: row.itemId,
    item_name: row.itemName,
    store_id: row.storeId,
    store_name: row.storeName,
    price: row.unitPrice,
    currency: "market",
    stock: row.stock,
    available: row.available,
    raw_data: row.rawData,
    snapshot_date: snapshotDate,
  }));

  let inserted = 0;
  for (const part of chunk(payload, 500)) {
    await insertRows("price_snapshots", part, {
      query: "on_conflict=item_id,store_name,snapshot_date",
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    inserted += part.length;
  }
  return inserted;
}

async function notifyWatchers(rows, snapshotDate) {
  const activeSubscriptions = await selectRows(
    "price_watch_subscriptions",
    "active=eq.true&select=id,player_name,item_id,item_name,target_price,push_endpoint,push_p256dh,push_auth",
  );
  const byItem = rows.reduce((groups, row) => {
    if (!groups[row.itemId]) {
      groups[row.itemId] = [];
    }
    groups[row.itemId].push(row);
    return groups;
  }, {});

  let matched = 0;
  let sent = 0;
  let skipped = 0;

  for (const subscription of activeSubscriptions || []) {
    const offers = (byItem[subscription.item_id] || [])
      .filter((row) => row.available && Number.isFinite(row.unitPrice))
      .sort((left, right) => left.unitPrice - right.unitPrice);
    const bestOffer = offers[0];
    const targetPrice = Number(subscription.target_price);

    if (!bestOffer || !Number.isFinite(targetPrice) || bestOffer.unitPrice > targetPrice) {
      continue;
    }

    matched += 1;

    try {
      const claimedRows = await insertRows("price_watch_notifications", [
        {
          subscription_id: subscription.id,
          item_id: subscription.item_id,
          item_name: subscription.item_name,
          store_name: bestOffer.storeName,
          price: bestOffer.unitPrice,
          target_price: targetPrice,
          snapshot_date: snapshotDate,
          delivery_status: "pending",
        },
      ], {
        query: "on_conflict=subscription_id,item_id,snapshot_date",
        prefer: "resolution=ignore-duplicates,return=representation",
      });
      const notificationLog = claimedRows && claimedRows[0] ? claimedRows[0] : null;

      if (!notificationLog) {
        skipped += 1;
        continue;
      }

      let deliveryStatus = "skipped";
      let deliveryError = null;

      if (subscription.push_endpoint && subscription.push_p256dh && subscription.push_auth) {
        try {
          const result = await sendPushNotification(
            {
              endpoint: subscription.push_endpoint,
              keys: {
                p256dh: subscription.push_p256dh,
                auth: subscription.push_auth,
              },
            },
            {
              title: "PVC price alert",
              body:
                bestOffer.itemName +
                " hit " +
                bestOffer.unitPrice.toFixed(2) +
                " at " +
                bestOffer.storeName,
              url: "/analytics?item=" + encodeURIComponent(bestOffer.itemId),
              itemId: bestOffer.itemId,
            },
          );
          if (result.skipped) {
            skipped += 1;
            deliveryStatus = "skipped";
            deliveryError = result.reason || "Push delivery skipped.";
          } else {
            sent += 1;
            deliveryStatus = "sent";
          }
        } catch (error) {
          skipped += 1;
          deliveryStatus = "failed";
          deliveryError = error instanceof Error ? error.message : String(error);
        }
      } else {
        skipped += 1;
        deliveryStatus = "skipped";
        deliveryError = "Subscription has no browser push endpoint.";
      }

      await updateRows(
        "price_watch_notifications",
        "id=eq." + encodeURIComponent(notificationLog.id),
        {
          delivery_status: deliveryStatus,
          delivery_error: deliveryError,
          sent_at: new Date().toISOString(),
        },
        { prefer: "return=minimal" },
      );
    } catch (error) {
      skipped += 1;
      console.error("Watch notification failed:", error);
    }
  }

  return { matched, sent, skipped };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", "https://pvc.local");
  const providedSecret = url.searchParams.get("secret") || getBearer(req);
  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    res.status(401).json({ error: "Invalid cron secret.", trigger: getTriggerInfo(req) });
    return;
  }

  if (!hasSupabaseConfig()) {
    res.status(503).json({
      error: "Supabase is not configured yet.",
      details: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
      trigger: getTriggerInfo(req),
    });
    return;
  }

  try {
    const snapshotDate = todayIso();
    const liveData = await fetchLiveMarketData();
    const normalized = normalizeMarketData(liveData);
    const rows = normalized.rows.filter((row) => Number.isFinite(row.unitPrice));
    const inserted = await saveSnapshots(rows, snapshotDate);
    const notifications = await notifyWatchers(rows, snapshotDate);

    res.status(200).json({
      ok: true,
      snapshotDate,
      rows: rows.length,
      inserted,
      notifications,
      trigger: getTriggerInfo(req),
    });
  } catch (error) {
    res.status(500).json({
      error: "Daily snapshot failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
