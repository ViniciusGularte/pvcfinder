const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "";

function isPlaceholder(value) {
  return !value;
}

function hasSupabaseConfig() {
  return !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_SERVICE_ROLE_KEY);
}

function hasPushConfig() {
  return (
    !isPlaceholder(VAPID_PUBLIC_KEY) &&
    !isPlaceholder(VAPID_PRIVATE_KEY) &&
    !isPlaceholder(VAPID_SUBJECT)
  );
}

function getPublicConfig() {
  return {
    vapidPublicKey: isPlaceholder(VAPID_PUBLIC_KEY) ? "" : VAPID_PUBLIC_KEY,
    supabaseConfigured: hasSupabaseConfig(),
    pushConfigured: hasPushConfig(),
  };
}

async function supabaseFetch(path, options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase env vars are missing.");
  }

  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path.replace(/^\//, "");
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error("Supabase returned " + response.status + (body ? ": " + body : ""));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function selectRows(table, query) {
  return supabaseFetch(table + (query ? "?" + query : ""), {
    method: "GET",
    headers: { Prefer: "return=representation" },
  });
}

async function insertRows(table, rows, options = {}) {
  const query = options.query ? "?" + options.query : "";
  return supabaseFetch(table + query, {
    method: "POST",
    body: JSON.stringify(rows),
    headers: {
      Prefer: options.prefer || "return=representation",
    },
  });
}

async function updateRows(table, query, patch, options = {}) {
  return supabaseFetch(table + (query ? "?" + query : ""), {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: {
      Prefer: options.prefer || "return=representation",
    },
  });
}

module.exports = {
  CRON_SECRET,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
  getPublicConfig,
  hasPushConfig,
  hasSupabaseConfig,
  insertRows,
  isPlaceholder,
  selectRows,
  supabaseFetch,
  updateRows,
};
