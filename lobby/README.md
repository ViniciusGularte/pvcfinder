# PVC Lobby

A standalone Three.js multiplayer lounge served from the PVC Finder VPS at
`/lobby/`. The Node process owns only ephemeral room state: connected players,
positions, seats, chat history, jukebox state and the selected map dimension.

## Local

```bash
npm install
npm start
```

Open `http://127.0.0.1:8081/lobby/`.

## VPS

Run `server.js` as a dedicated systemd service on port `8081`, then reverse
proxy `/lobby` and `/lobby/*` without stripping the path. The service exposes
`/lobby/api/status` and upgrades `/lobby/ws` to WebSocket automatically through
Caddy.

The repository includes `pvc-lobby.service`, ready to copy into
`/etc/systemd/system/`.
