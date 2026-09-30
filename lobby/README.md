# PVC Lobby

A standalone Three.js multiplayer lounge served by Vercel at `/lobby/`. The VPS
Node process is backend-only and owns the WebSocket plus ephemeral room state:
connected players, positions, seats, chat history, jukebox state and the
selected map dimension.

## Local

```bash
npm install
npm start
```

Open `http://127.0.0.1:8081/lobby/`.

## VPS backend

Run `server.js` as a dedicated systemd service on port `8081`. Caddy only needs
to proxy `/lobby/ws` and `/lobby/api/*` to this process. The public frontend
connects to `wss://api.theyasked.co/lobby/ws`.

The repository includes `pvc-lobby.service`, ready to copy into
`/etc/systemd/system/`.
