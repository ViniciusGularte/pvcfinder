# PVC Lobby 3D

A cozy 3D lobby for PVC players, built with three.js. Join with your Minecraft nickname,
walk around as your own skin, sit on the sofa, pet the cat, use the computers and browse the live PVC map.

## Running it

The project uses ES modules, so it must be served over HTTP (opening `index.html` directly from disk won't work).

- **Locally:** run `npx serve .` or `python3 -m http.server` in this folder, then open the address it prints.
- **Online (free):** upload the folder to GitHub Pages, Netlify or Cloudflare Pages and share the link.

No build step and no install. three.js loads from a CDN.

## Controls

| | |
|---|---|
| Move | `W A S D` / arrows · `Shift` to run · `Space` to jump · or click the floor |
| Look | drag with the mouse / finger |
| Camera | First person is permanent; emotes briefly switch to third person |
| Interact | click an object, or walk up to it and press `E` |
| Stand up | `E`, move, or the *Stand up* button (`Esc` at a computer) |
| Music | click the radio, ▶ in the bar, or `M` |

## What you can do

- **Live map** on the big screen (search places, jump to coordinates)
- **Server board**: who's online (your name is highlighted with ★)
- **Computers (4)**: sit down, watch them boot, type into the notes window
- **Sit** on the sofa, armchairs, bean bags, stools and chairs
- **Fireplace**: stoke it. **Cat**: pet it. **Lamps**: switch them on and off
- **Bookshelves**: read a random book. **Plants**: water them. **Chess**: move a piece
- **Kitchen**: brew coffee, open the fridge. **Mug**: take a sip
- **Door**: peek outside (the message depends on the weather). **Light switch**: string lights on/off
- **Window + weather panel**: rain, storm, snow, fog, wind, night, sunset or day. The room reacts too: rain sounds, lightning flashes, and sunlight coming through the window
- **Radio**: procedurally generated lo-fi music (4 tracks) + ambience

## Project structure

```
index.html          HUD markup + import map
css/style.css       all styling
js/
  main.js           entry point: builds the world in order, runs the render loop
  core.js           shared state (S): scene, camera, renderers, registries
  config.js         tweakable numbers: API, room size, screen/window placement, skin sources
  util.js           helpers (mesh/group builders, colliders, toast, tiny tween, particles)
  textures.js       procedural canvas textures (wood, plaster, rugs, tiles…)
  interact.js       interaction registry, mouse picking, nearest-object lookup
  room.js           floor, walls, window, curtains, string lights, dust
  furniture.js      lounge, fireplace + cat, kitchen, entrance, game table, reading nook…
  computers.js      the 4-PC pod with live screen canvases and typing
  mapscreen.js      live PVC map (iframe in 3D via CSS3DRenderer) + map controls
  board.js          chalkboard with server status
  weather.js        outdoor scene, sky, rain/snow/lightning, weather panel
  audio.js          Web Audio music, ambience and sound effects
  avatar.js         skin fetching + Minecraft-style player model and animations
  player.js         movement, sitting, first-person camera, emote view, E prompt
  ui.js             login, player chip, radio bar
```

### Adding a new interactive object

```js
import { addInteractable } from './interact.js';

const thing = mesh(new THREE.BoxGeometry(.5, .5, .5), std({ color: 0xff8800 }), [x, .25, z]);
addCollider(x, z, .5, .5);                     // optional: block walking through it
addInteractable(thing, {
  verb: 'Poke', name: 'the box',               // shown as "E Poke the box"
  anchor: V(x, 0, z), range: 1.4,              // farther than this → walk there first
  action: () => toast('📦 Boop!'),
});
```

Things you can sit on use `seatable(...)` in `furniture.js`. Furniture faces local −z.

## Skins

`fetchSkin()` resolves the player's UUID, then tries Crafatar, mc-heads.net and minotar.net
(all CORS-friendly). Classic and slim (Alex) arms and both skin layers are supported. Legacy 64×32 skins are converted.
If no skin is found (or for guests), an original default look is used.

## Ideas for next steps

- **Multiplayer**: see other players in the lobby. Needs a small WebSocket server (e.g. Node + `ws`) that relays positions, nicknames and seat changes.
- **Computer apps**: the PC desktop already has Maps / Shops / Notes icons. The shop endpoints in the API (`/pvc-utils/itemSearch`, `/pvc-utils/stats`) would make a nice "Shops" app.
- **Performance knobs**: lower the shadow map sizes in `weather.js` / `furniture.js`, or the light count, for weak laptops.
