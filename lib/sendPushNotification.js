const {
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
  hasPushConfig,
} = require("./supabaseServer");

async function sendPushNotification(subscription, payload) {
  if (!hasPushConfig()) {
    return { ok: false, skipped: true, reason: "Push constants are still placeholders." };
  }

  let webpush;
  try {
    webpush = require("web-push");
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: "Install dependencies first: npm install.",
    };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webpush.sendNotification(subscription, JSON.stringify(payload));
  return { ok: true };
}

module.exports = { sendPushNotification };
