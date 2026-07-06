const LIVE_DATA_URL = "https://web.peacefulvanilla.club/shops/data.json";
const fs = require("fs/promises");
const path = require("path");

const fetchAttempts = [
  {
    name: "minimal",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "PVCFinder/1.0 (+https://pvcstorefinder.vercel.app/)",
    },
  },
  {
    name: "browser",
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  },
  {
    name: "same-origin",
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer: "https://web.peacefulvanilla.club/",
      origin: "https://web.peacefulvanilla.club",
      "user-agent": "Mozilla/5.0 (compatible; PVCShopBrowser/1.0; +https://web.peacefulvanilla.club/)",
    },
  },
];

async function readSnapshotFallback() {
  const snapshotPath = path.join(process.cwd(), "data", "shops-snapshot.json");
  const raw = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(raw);
}

async function fetchLiveMarketData(signal) {
  const errors = [];

  for (const attempt of fetchAttempts) {
    try {
      const response = await fetch(LIVE_DATA_URL, {
        signal,
        headers: attempt.headers,
      });

      if (!response.ok) {
        errors.push(attempt.name + ":" + response.status);
        continue;
      }

      return {
        data: await response.json(),
        attempt: attempt.name,
        errors,
      };
    } catch (error) {
      errors.push(
        attempt.name + ":" + (error instanceof Error ? error.message : String(error))
      );
    }
  }

  throw new Error("PVC upstream failed attempts: " + errors.join(", "));
}

module.exports = async function handler(req, res) {
  let timeout;

  function setBaseHeaders(source) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-PVC-Data-Source", source);
  }

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);
    const live = await fetchLiveMarketData(controller.signal);
    const data = live.data;
    setBaseHeaders("live");
    res.setHeader("X-PVC-Live-Attempt", live.attempt);
    if (live.errors.length) {
      res.setHeader("X-PVC-Live-Retry-Errors", live.errors.join(";"));
    }
    res.status(200).json(data);
  } catch (error) {
    try {
      const data = await readSnapshotFallback();
      setBaseHeaders("snapshot");
      res.setHeader(
        "X-PVC-Live-Error",
        error instanceof Error ? error.message : String(error)
      );
      res.status(200).json(data);
    } catch (fallbackError) {
      setBaseHeaders("error");
      res.status(502).json({
        error: "Failed to fetch PVC shop data",
        details: error instanceof Error ? error.message : String(error),
        fallbackDetails:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};
