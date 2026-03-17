module.exports = async function handler(req, res) {
  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("https://web.peacefulvanilla.club/shops/data.json", {
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

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error("PVC upstream returned " + response.status);
    }

    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (error) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({
      error: "Failed to fetch PVC shop data",
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};
