# PVC Lobby

The current Three.js multiplayer frontend lives in `../pvc-lobby-3d/`. This
module is the backend-only VPS service and owns the WebSocket plus ephemeral
room state: connected players, positions, seats, ephemeral live chat, jukebox state,
the shared PVC map view, the persistent community chalkboard and the
server-controlled weather. The room is capped at 20 players.

## Local

```bash
npm install
npm start
```

Open `http://127.0.0.1:8081/lobby/`.

Run `npm run dev` at the repository root and open
`http://127.0.0.1:3000/`; the frontend connects here automatically.

## VPS backend

Run `server.js` as a dedicated systemd service on port `8081`. Caddy only needs
to proxy `/lobby/ws` and `/lobby/api/*` to this process. The public frontend
connects to `wss://api.theyasked.co/lobby/ws`.

The repository includes `pvc-lobby.service`, ready to copy into
`/etc/systemd/system/`.

Weather is global and can only be changed in the service environment:

```env
MAX_PLAYERS=20
WEATHER_PRESET=rain
WEATHER_TIME=night
```

Valid presets: `clear`, `cloudy`, `rain`, `storm`, `snow`, `fog`.
Valid times: `night`, `sunset`, `day`.

The chalkboard is written to `BOARD_FILE` after each change. Include this file
in VPS backups. Map tiles are proxied and cached by the lobby service from the
configured `SQUAREMAP_URL`, so the frontend no longer embeds the external map.
