const fs = require("fs/promises");
const path = require("path");

const SNAPSHOT_PATH = path.join(__dirname, "..", "data", "shops-snapshot.json");
const LIVE_DATA_URL = "https://web.peacefulvanilla.club/shops/data.json";

async function readSnapshot() {
  const contents = await fs.readFile(SNAPSHOT_PATH, "utf8");
  return JSON.parse(contents);
}

async function writeSnapshot(data) {
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(data), "utf8");
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

    const response = await fetch(LIVE_DATA_URL, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://web.peacefulvanilla.club/",
        "origin": "https://web.peacefulvanilla.club",
        "user-agent": "Mozilla/5.0 (compatible; PVCShopBrowser/1.0; +https://web.peacefulvanilla.club/)"
      }
    });

    if (!response.ok) {
      throw new Error("PVC upstream returned " + response.status);
    }

    const data = await response.json();
    await writeSnapshot(data);

    setBaseHeaders("live");
    res.status(200).json(data);
  } catch (error) {
    try {
      const snapshot = await readSnapshot();
      setBaseHeaders("snapshot");
      res.status(200).json(snapshot);
      return;
    } catch (snapshotError) {
      setBaseHeaders("error");
      res.status(500).json({
        error: "Failed to fetch PVC shop data",
        details: error instanceof Error ? error.message : String(error),
        snapshotDetails:
          snapshotError instanceof Error
            ? snapshotError.message
            : String(snapshotError)
      });
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};
