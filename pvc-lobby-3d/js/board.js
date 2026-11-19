// Persistent multiplayer chalkboard. The same canvas drives the 3D texture and editor.
import * as THREE from 'three';
import { S } from './core.js';
import { ROOM } from './config.js';
import { $, V, std, mesh } from './util.js';
import { addInteractable } from './interact.js';

const BX = 6.7, BY = 2.2, BW = 5.2, BH = 3.05;
const W = 1280, H = 750;
const MAX_STROKES = 800;
let canvas, ctx, tex;
let strokes = [];
let active = null;

export function buildBoard() {
  canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  ctx = canvas.getContext('2d');
  tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const z = -ROOM.d / 2 + .045;
  const board = mesh(new THREE.PlaneGeometry(BW, BH), std({ map: tex, roughness: .96 }), [BX, BY, z], { cast: false, name: 'community chalkboard' });
  const frame = std({ color: 0x8a5a33, roughness: .7 });
  for (const [w, h, x, y] of [[BW + .22, .12, BX, BY + BH / 2 + .06], [BW + .22, .12, BX, BY - BH / 2 - .06], [.12, BH, BX - BW / 2 - .06, BY], [.12, BH, BX + BW / 2 + .06, BY]])
    mesh(new THREE.BoxGeometry(w, h, .08), frame, [x, y, z]);
  mesh(new THREE.BoxGeometry(BW * .94, .07, .2), frame, [BX, BY - BH / 2 - .16, z + .08]);
  for (const [x, color] of [[BX - 1.5, 0xf2efe4], [BX - .9, 0xffd27a], [BX - .3, 0xa8f0b4], [BX + .3, 0x8fd3ff]])
    mesh(new THREE.BoxGeometry(.42, .035, .04), std({ color }), [x, BY - BH / 2 - .2, z + .19]);
  addInteractable(board, { verb: 'Draw on', name: 'the community board', anchor: V(BX, 0, z), range: 60, action: openBoard });
  S.board = { applySnapshot, applyStroke, clear };
  wireEditor(); redraw();
}

function background(g) {
  g.fillStyle = '#23372c'; g.fillRect(0, 0, W, H);
  const noise = g.createPattern(noiseCanvas(), 'repeat');
  g.globalAlpha = .22; g.fillStyle = noise; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  g.fillStyle = 'rgba(242,239,228,.42)'; g.font = '600 27px Caveat';
  g.fillText('PVC COMMUNITY BOARD · draw something for the next visitor', 28, 38);
}

let noisePattern;
function noiseCanvas() {
  if (noisePattern) return noisePattern;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .15})`; g.fillRect(Math.random() * 96, Math.random() * 96, Math.random() * 4 + 1, 1); }
  return noisePattern = c;
}

function paintStroke(g, stroke) {
  const points = stroke.points || []; if (points.length < 2) return;
  g.strokeStyle = stroke.color; g.lineWidth = stroke.width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(points[0][0] * W, points[0][1] * H);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], n = points[i + 1];
    g.quadraticCurveTo(p[0] * W, p[1] * H, (p[0] + n[0]) * W / 2, (p[1] + n[1]) * H / 2);
  }
  const last = points.at(-1); g.lineTo(last[0] * W, last[1] * H); g.stroke();
}

function redraw() {
  background(ctx); strokes.forEach(stroke => paintStroke(ctx, stroke));
  if (active) paintStroke(ctx, active);
  tex.needsUpdate = true;
  const editor = $('chalkCanvas');
  if (editor) { const g = editor.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(canvas, 0, 0); }
}

function trimStrokes() { if (strokes.length > MAX_STROKES) strokes.splice(0, strokes.length - MAX_STROKES); }
function applySnapshot(snapshot) { strokes = Array.isArray(snapshot?.strokes) ? snapshot.strokes.slice(-MAX_STROKES) : []; redraw(); }
function applyStroke(stroke) { if (!stroke?.points) return; strokes.push(stroke); trimStrokes(); redraw(); }
function clear() { strokes = []; active = null; redraw(); }
export function redrawBoard() { redraw(); }

function openBoard() {
  if (S.player.state === 'sit') S.player.stand();
  S.mode = 'board'; $('chalkEditor').classList.add('open'); redraw();
}
function closeBoard() { $('chalkEditor').classList.remove('open'); S.mode = 'walk'; }

function wireEditor() {
  const editor = $('chalkCanvas'); editor.width = W; editor.height = H;
  const point = event => {
    const rect = editor.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };
  editor.onpointerdown = event => {
    editor.setPointerCapture(event.pointerId);
    const tool = document.querySelector('[data-chalk].on');
    active = { color: tool?.dataset.chalk || '#f2efe4', width: +(tool?.dataset.width || 8), points: [point(event)] };
  };
  editor.onpointermove = event => {
    if (!active) return;
    const p = point(event), last = active.points.at(-1);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < .002) return;
    active.points.push(p); redraw();
  };
  const finish = () => {
    if (!active) return;
    const stroke = active; active = null;
    if (stroke.points.length > 256) {
      const step = (stroke.points.length - 1) / 255;
      stroke.points = Array.from({ length: 256 }, (_, i) => stroke.points[Math.round(i * step)]);
    }
    if (stroke.points.length > 1) { strokes.push(stroke); trimStrokes(); S.multiplayer?.boardStroke(stroke); }
    redraw();
  };
  editor.onpointerup = finish; editor.onpointercancel = finish;
  document.querySelectorAll('[data-chalk]').forEach(button => button.onclick = () => {
    document.querySelectorAll('[data-chalk]').forEach(item => item.classList.remove('on')); button.classList.add('on');
  });
  $('chalkClose').onclick = closeBoard;
  $('chalkClear').onclick = () => { if (confirm('Erase the community board for everyone?')) S.multiplayer?.clearBoard(); };
  addEventListener('keydown', event => { if (event.code === 'Escape' && S.mode === 'board') closeBoard(); });
}
