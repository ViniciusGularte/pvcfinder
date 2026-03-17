module.exports = async function handler(req, res) {
  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("https://web.peacefulvanilla.club/shops/data.json", {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("PVC upstream returned " + response.status);
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (error) {
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
