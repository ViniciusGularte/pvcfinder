// Entry point: build the world in order, then run the render loop.
import { S } from './core.js';
import { buildRoom } from './room.js';
import { buildFurniture } from './furniture.js';
import { buildComputers } from './computers.js';
import { buildMapScreen } from './mapscreen.js';
import { buildBoard } from './board.js';
import { buildWeather } from './weather.js';
import { buildBunker } from './bunker.js';
import { buildSewer } from './sewer.js';
import { createPlayer } from './player.js';
import { initUI } from './ui.js';
import { initMultiplayer } from './multiplayer.js';
import { initChat } from './chat.js';
import { initWiki } from './wiki.js';
import { initCinematicTest } from './cinematic-test.js';
import { initNPC } from './npc.js';

try { await Promise.all([document.fonts.load('600 48px Caveat'), document.fonts.load('600 48px Fraunces')]); } catch {}

buildRoom();
buildFurniture();
buildComputers();
buildMapScreen();
buildBoard();
buildBunker();
buildSewer();

// Everything built so far is indoors: no fog, and clickable.
S.scene.traverse(o => { if (o.material && !o.userData.outdoor) [].concat(o.material).forEach(m => { m.fog = false; }); });
S.pickables = S.scene.children.slice();

S.weather = buildWeather();   // outdoor scene + sun/sky lights
createPlayer();   // avatar is added after the pickables list, so you can't click yourself
initNPC();
initMultiplayer();
initChat();
initWiki();
initUI();
initCinematicTest();

function frame() {
  const dt = Math.min(S.clock.getDelta(), .05), t = S.clock.elapsedTime;
  for (const f of S.updaters) f(dt, t);
  S.renderer.render(S.scene, S.camera);
  S.cssRenderer.render(S.cssScene, S.camera);
  requestAnimationFrame(frame);
}
window.PVC = S;   // handy for poking around in the browser console
frame();
document.getElementById('loading').classList.add('gone');
