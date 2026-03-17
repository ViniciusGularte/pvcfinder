const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const shopsHandler = require("../api/shops");

const rootDir = path.resolve(__dirname, "..");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function enhanceResponse(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.json = function json(payload) {
    sendJson(res, res.statusCode || 200, payload);
  };

  return res;
}

function safePathname(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");

  if (normalizedPath === "/" || normalizedPath === ".") {
    return "index.html";
  }

  return normalizedPath.replace(/^[/\\]+/, "");
}

function serveFile(req, res, relativePath) {
  const filePath = path.join(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stats.size);

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Failed to read file" });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const enhancedRes = enhanceResponse(res);
  const requestUrl = req.url || "/";
  const { pathname } = new URL(requestUrl, `http://${host}:${port}`);

  if (pathname === "/api/shops") {
    try {
      await shopsHandler(req, enhancedRes);
    } catch (error) {
      sendJson(enhancedRes, 500, {
        error: "Unexpected local server error",
        details: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(enhancedRes, 405, { error: "Method not allowed" });
    return;
  }

  serveFile(req, enhancedRes, safePathname(requestUrl));
});

server.listen(port, host, () => {
  console.log(`PVC Finder local server running at http://${host}:${port}`);
});
