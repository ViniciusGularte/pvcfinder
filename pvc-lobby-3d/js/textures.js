// Procedural textures (no image files needed).
import { canvasTex, rnd } from './util.js';

function wood(g, W, H) {
  const ph = 128;
  for (let y = 0; y < H; y += ph) {
    let x = -rnd(0, 400);
    while (x < W) {
      const w = rnd(320, 620);
      g.fillStyle = `hsl(${rnd(24, 32)},${rnd(38, 48)}%,${rnd(30, 40)}%)`;
      g.fillRect(x, y, w, ph);
      for (let i = 0; i < 45; i++) {
        g.strokeStyle = `rgba(55,28,10,${rnd(0, .18)})`; g.lineWidth = rnd(1, 3);
        const yy = y + rnd(0, ph);
        g.beginPath(); g.moveTo(x, yy);
        g.bezierCurveTo(x + w * .3, yy + rnd(-8, 8), x + w * .6, yy + rnd(-8, 8), x + w, yy + rnd(-4, 4)); g.stroke();
      }
      g.fillStyle = 'rgba(25,12,4,.6)'; g.fillRect(x, y, 3, ph);
      x += w;
    }
    g.fillStyle = 'rgba(25,12,4,.65)'; g.fillRect(0, y, W, 3);
  }
}

function rug(cols, accent) {
  return canvasTex(1024, 640, (g, W, H) => {
    cols.forEach((c, i) => { g.fillStyle = c; const m = i * 34; g.beginPath(); g.roundRect(m, m, W - 2 * m, H - 2 * m, 30); g.fill(); });
    g.fillStyle = accent;
    for (let x = 280; x < W - 260; x += 70) for (let y = 270; y < H - 250; y += 70) {
      g.save(); g.translate(x + 15, y + 15); g.rotate(Math.PI / 4); g.fillRect(-12, -12, 24, 24); g.restore();
    }
    for (let i = 0; i < 20000; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0, .08)})`; g.fillRect(rnd(0, W), rnd(0, H), 2, 2); }
  });
}

export const T = {
  wood: canvasTex(1024, 1024, wood, [2, 2]),
  floor: canvasTex(1024, 1024, wood, [6, 6]),
  plaster: canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#e9d6b8'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,245,225' : '150,110,70'},${rnd(0, .07)})`; g.fillRect(rnd(0, W), rnd(0, H), rnd(1, 4), rnd(1, 4)); }
  }, [8, 2.5]),
  panel: canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = '#4f6b52'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2; i++) {
      const x = i * W / 2 + 18, w = W / 2 - 36;
      g.strokeStyle = 'rgba(20,35,22,.55)'; g.lineWidth = 6; g.strokeRect(x, 30, w, H - 60);
      g.strokeStyle = 'rgba(200,230,200,.18)'; g.lineWidth = 2; g.strokeRect(x + 5, 35, w - 10, H - 70);
    }
  }, [12, 1]),
  rugWarm: rug(['#a8452c', '#e9cfa3', '#7a2f22', '#d9a24e', '#2f4a3f', '#e9cfa3', '#a8452c'], '#e9cfa3'),
  rugCool: rug(['#2f4a5f', '#e6dcc4', '#3d6b70', '#c9a35a', '#1f3340', '#e6dcc4', '#2f4a5f'], '#e6dcc4'),
  rugSage: rug(['#5d7a5a', '#efe3c8', '#8a5a3a', '#d6b46a', '#3e5a40', '#efe3c8', '#5d7a5a'], '#efe3c8'),
  stone: canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#5b544d'; g.fillRect(0, 0, W, H);
    const bh = 64;
    for (let y = 0, r = 0; y < H; y += bh, r++) for (let x = (r % 2) * -64; x < W; x += 128) {
      g.fillStyle = `hsl(28,${rnd(4, 12)}%,${rnd(42, 58)}%)`; g.fillRect(x + 4, y + 4, 120, bh - 8);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0, .12)})`; g.fillRect(x + rnd(6, 118), y + rnd(6, bh - 10), rnd(3, 10), rnd(3, 8)); }
    }
  }),
  grille: canvasTex(256, 160, (g, W, H) => {
    g.fillStyle = '#3a2a20'; g.fillRect(0, 0, W, H);
    for (let y = 4; y < H; y += 6) for (let x = (y / 6 % 2) * 3 + 2; x < W; x += 6) { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  }),
  tiles: canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 64) {
      g.fillStyle = `hsl(${rnd(160, 175)},${rnd(18, 28)}%,${rnd(62, 72)}%)`; g.fillRect(x + 2 + (y / 32 % 2) * 32 - 32, y + 2, 60, 28); g.fillRect(x + 2 + (y / 32 % 2) * 32 + 32, y + 2, 60, 28);
    }
  }, [6, 2]),
  rainGlass: canvasTex(256, 512, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      const x = rnd(0, W), y = rnd(0, H), r = rnd(1.5, 4.5);
      g.fillStyle = 'rgba(210,225,255,.55)'; g.beginPath(); g.ellipse(x, y, r * .8, r, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x - r * .3, y - r * .3, r * .3, 0, 7); g.fill();
      if (Math.random() < .3) { g.strokeStyle = 'rgba(210,225,255,.35)'; g.lineWidth = r * .6; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + rnd(-3, 3), y - rnd(20, 70)); g.stroke(); }
    }
  }, [2, 1.4]),
  checker: canvasTex(256, 256, (g) => {
    g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#3b2416' : '#e8d3a8'; g.fillRect(16 + x * 28, 16 + y * 28, 28, 28); }
  }),
};
export const BOOK_COLORS = [0x8c3b2e, 0x2f5d50, 0xc59a3c, 0x3d4f7a, 0x6b3f69, 0xd6c3a0, 0x9a5b2c, 0x45603a];
