# GRV EYE

A history recorder, area watcher and player tracker for the Peaceful Vanilla Club Squaremap/LiveAtlas map.

- **Backend (same PVC Finder VPS):** reads every player's position from the public map every few seconds, stores it in SQLite, and serves the API, map tiles and skins.
- **Frontend:** is served by the same process and published at `/grveye/` through the existing Nginx host.

## What the page does

**Area.** Draw a box or polygon, pick a time range. You get everyone recorded inside it, each visit with times and duration, and an activity chart.

**Watch.** Turn a selected area into a watch. While the tab is open, you get a desktop notification, a sound and an on-screen alert when someone walks in. Watches are saved per browser.

**Players.** Search any player (Java or Bedrock) and select one:
- Their skin appears as a rotating green hologram. It walks while they're online and idles while offline.
- Pick a window (1h, 6h, 24h, 3d, 7d, or a custom from/to date) to trace their path on the map in green. Newer parts are brighter, and the line breaks on teleports, logouts and dimension changes.
- Places where they stood still for 3+ minutes show as circles sized by how long they stayed, and are also listed in the sidebar.
- **Replay** moves a cursor along the path with the time and coordinates.
- **Follow live** keeps the map on them while they move.

## Layout

```
grv-eye/
├── server.js           API, polling loop, WebSocket
├── lib/
│   ├── bluemap.js      optional BlueMap discovery
│   ├── squaremap.js    PVC Squaremap world discovery
│   ├── sources.js      bluemap / squaremap / dynmap / json / demo
│   ├── tiles.js        caching proxy for Squaremap/BlueMap tiles
│   ├── skins.js        Java + Bedrock skin resolver
│   ├── db.js           SQLite schema
│   └── geo.js          point-in-polygon
└── public/             page served at /grveye/
    ├── index.html
    └── config.js       detects the same-origin /grveye mount path
```

## Deploy on the PVC Finder VPS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

cd /opt/grv-eye
npm ci --omit=dev
cp .env.example .env
nano .env
```

The checked-in defaults already target PVC's real Squaremap endpoint. Set at least:

```
ACCESS_TOKEN=something-long-and-random
BASE_PATH=/grveye
HOST=127.0.0.1
PORT=8080
SERVE_PAGE=true
SOURCE_TYPE=squaremap
SQUAREMAP_URL=https://web.peacefulvanilla.club/maps/
```

```bash
sudo npm i -g pm2
pm2 start server.js --name grv-eye
pm2 save && pm2 startup
```

Keep the SQLite file on persistent storage and include `grv-eye/data/eye.db*` in
the VPS backup. The WAL sidecars may exist while the process is running.

### Nginx route on the existing site

Add these locations to the same TLS server block that publishes PVC Finder. Do
not add a trailing slash to `proxy_pass`: the GRV Eye process expects its
`/grveye` prefix.

```nginx
location = /grveye {
    return 308 /grveye/;
}

location /grveye/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}
```

Reload Nginx, then check `https://your-pvcfinder-host/grveye/api/config` and open
`https://your-pvcfinder-host/grveye/`. `config.js` detects `/grveye`
automatically. The checked-in Vercel frontend configuration uses
`https://api.theyasked.co/grveye`; other separate frontend hosts remain supported
by setting an absolute `window.EYE_API` and adding that origin to `CORS_ORIGINS`.

## Skins

`GET /grveye/skin/:name` returns the skin PNG, with headers `X-Skin-Model` (slim/default), `X-Skin-Edition` (java/bedrock) and `X-Skin-Source` (player/default).

- **Java:** the player's UUID from the map, then Mojang's session server. If the UUID is unknown, it looks up the name first.
- **Bedrock (Geyser/Floodgate):** Floodgate UUIDs start with `00000000-0000-0000-` and end in the player's XUID. The GeyserMC global API turns that XUID into a skin. If the UUID isn't known yet, names starting with a Floodgate prefix (`.` or `*`, set in `BEDROCK_PREFIXES`) are looked up by gamertag.
- **Otherwise:** the default Steve skin, with `no skin found` shown on the hologram.

Skins are cached in memory for 6 hours.

## History notes

- Only what the server has seen since it started exists, so start it early.
- A position is stored when a player moves at least `PING_MIN_MOVE` blocks, or every `PING_KEEPALIVE_S` seconds while standing still.
- Path requests are capped at 31 days and 20,000 drawn points; longer paths are thinned evenly, keeping the breaks.
- Rough size: about 60 bytes per position. With 50 active players, expect roughly 1–2 GB per month.
- Keep `POLL_INTERVAL_MS` at 5000 or more. It's someone else's server.

## Local test

```bash
npm install
npm run demo          # fake players, serves the page too
```

Open http://localhost:8080/grveye/.

## API

```
GET  /grveye/api/config                          public
GET  /grveye/skin/:name                          public
GET  /grveye/tiles/:map/:lod/...png              public
GET  /grveye/api/status                          Bearer ACCESS_TOKEN
POST /grveye/api/area   {world, points, from, to}
GET  /grveye/api/players?q=
GET  /grveye/api/players/:name
GET  /grveye/api/players/:name/trail?from=&to=
WS   /grveye/ws?token=
```
