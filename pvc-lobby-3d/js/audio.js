// The radio plays a shared music file; ambience and small effects use the Web Audio API.
import { $, rnd, store } from './util.js';
import { S } from './core.js';

const TRACKS = [
  { name: 'Best Morning', url: '/assets/Upbeat%20Rock%20Positive%20by%20Infraction%20%5BNo%20Copyright%20Music%5D%20%20Best%20Morning.mp3' },
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const saved = store.get();
const MUSIC_LEVEL = .62;

let ctx, master, musicGain, musicIn, epBus, delay, analyser, ambBus, sfxBus, rainG, patterG, windG, windF, wn, bn, wow;
let radioAudio = null;
// The radio/track is global. Ambience remains a local preference per browser.
let playing = false, track = 0, ambOn = saved.amb === true;
let jukebox = { playing: false, track: 0, startedAt: null };
let step = 0, bar = 0, nextTime = 0;
const lvlBuf = new Uint8Array(256);

addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else if (ctx.state === 'suspended') ctx.resume();
});

function noiseBuffer(sec, brown) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function crackleBuffer(sec, rate, amp) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    if (Math.random() < rate) { const a = rnd(.3, 1) * amp * (Math.random() < .5 ? -1 : 1), len = Math.floor(rnd(8, 60)); for (let j = 0; j < len && i + j < d.length; j++) d[i + j] += a * Math.exp(-j / (len / 4)) * (Math.random() * 2 - 1); }
  }
  return b;
}
const loop = (buf, dest, offset = 0) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(0, offset); return s; };
const filt = (type, f, q = .7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master = gain(.9); master.connect(comp); comp.connect(ctx.destination);
  wn = noiseBuffer(3, false); bn = noiseBuffer(4, true);

  // music chain
  musicGain = gain(0); musicGain.connect(master);
  analyser = ctx.createAnalyser(); analyser.fftSize = 256; musicGain.connect(analyser);
  radioAudio = new Audio(TRACKS[0].url); radioAudio.preload = 'auto'; radioAudio.loop = true;
  ctx.createMediaElementSource(radioAudio).connect(musicGain);
  const lofi = filt('lowpass', 3200, .5); lofi.connect(musicGain);
  musicIn = gain(1); musicIn.connect(lofi);
  const trem = gain(.9); trem.connect(musicIn);
  const tl = ctx.createOscillator(); tl.frequency.value = 4.2; const tlg = gain(.08); tl.connect(tlg); tlg.connect(trem.gain); tl.start();
  epBus = gain(1); epBus.connect(trem);
  wow = ctx.createOscillator(); wow.frequency.value = .45; const wg = gain(7); wow.connect(wg); wow.start(); wow.out = wg;
  delay = ctx.createDelay(1.5); const fb = gain(.32), dl = filt('lowpass', 1800); delay.connect(dl); dl.connect(fb); fb.connect(delay);
  const dOut = gain(.3); dl.connect(dOut); dOut.connect(musicIn); epBus.connect(delay);
  const crackle = gain(.22); loop(crackleBuffer(4, .0007, .5), crackle); crackle.connect(musicGain);
  const hiss = gain(.006); loop(wn, hiss, 1); hiss.connect(musicGain);

  // ambience
  ambBus = gain(ambOn ? 1 : 0); ambBus.connect(master);
  rainG = gain(0); const rf = filt('lowpass', 1100); loop(bn, rf); rf.connect(rainG); rainG.connect(ambBus);
  patterG = gain(0); const pf = filt('bandpass', 2600, .6); loop(wn, pf, .5); pf.connect(patterG); patterG.connect(ambBus);
  windG = gain(0); windF = filt('bandpass', 500, 1.4); loop(wn, windF, 2); windF.connect(windG); windG.connect(ambBus);
  const wl = ctx.createOscillator(); wl.frequency.value = .08; const wlg = gain(260); wl.connect(wlg); wlg.connect(windF.frequency); wl.start();
  const fireG = gain(.45); fireG.connect(ambBus);
  const fc = filt('bandpass', 2400, .8); loop(crackleBuffer(5, .0009, .9), fc); const fcg = gain(.35); fc.connect(fcg); fcg.connect(fireG);
  const fr = filt('lowpass', 220); loop(bn, fr, 1.3); const frg = gain(.12); fr.connect(frg); frg.connect(fireG);

  sfxBus = gain(.8); sfxBus.connect(master);
  setInterval(scheduler, 25);
  if (playing) beginPlayback(jukebox.startedAt);
  ui();
}

/* ---------- instruments ---------- */
function ep(m, t, dur, vel) {
  const f = mtof(m), g = gain(0); g.connect(epBus);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .012);
  g.gain.exponentialRampToValueAtTime(vel * .35, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  const o1 = ctx.createOscillator(); o1.frequency.value = f; wow.out.connect(o1.detune); o1.connect(g);
  const o2 = ctx.createOscillator(); o2.frequency.value = f * 2; const g2 = gain(.12); o2.connect(g2); g2.connect(g);
  const o3 = ctx.createOscillator(); o3.frequency.value = f * 7; const g3 = gain(0); env(g3, t, .002, vel * .08, .18); o3.connect(g3); g3.connect(epBus);
  for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dur + .05); }
}
function bass(m, t, dur) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
  const f = filt('lowpass', 380), g = gain(0); env(g, t, .02, .32, dur);
  o.connect(f); f.connect(g); g.connect(musicIn); o.start(t); o.stop(t + dur + .05);
}
function lead(m, t, dur) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); wow.out.connect(o.detune);
  const f = filt('lowpass', 1700), g = gain(0); env(g, t, .03, .07, dur);
  o.connect(f); f.connect(g); g.connect(epBus); o.start(t); o.stop(t + dur + .05);
}
function kick(t, v) {
  const o = ctx.createOscillator(), g = gain(0);
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
  env(g, t, .004, .55 * v, .38); o.connect(g); g.connect(musicIn); o.start(t); o.stop(t + .4);
}
function hit(t, type, f, q, peak, dur, dest = musicIn) {
  const s = ctx.createBufferSource(); s.buffer = wn; const fl = filt(type, f, q), g = gain(0);
  env(g, t, .002, peak, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, rnd(0, 2)); s.stop(t + dur + .02);
}

function scheduleStep(st, t) {
  const tr = TRACKS[track], spb = 60 / tr.bpm / 4, ch = tr.chords[bar % tr.chords.length];
  const random = salt => { const value = Math.sin((bar * 37 + st * 11 + track * 101 + salt) * 12.9898) * 43758.5453; return value - Math.floor(value); };
  const tt = t + ((st % 4 === 2) ? spb * .33 : 0);   // swing
  if (st === 0) ch.n.forEach((m, i) => ep(m, t + i * .018 + random(i + 1) * .01, spb * 15, .07 + random(i + 8) * .02));
  if (st === 10 && random(20) < .45) ch.n.slice(1).forEach((m, i) => ep(m, t + i * .015, spb * 6, .045));
  if (st === 0) bass(ch.b, t, spb * 6);
  if (st === 10) bass(ch.b, t, spb * 3);
  if (st === 14 && random(21) < .5) bass(ch.b + 7, t, spb * 2);
  if (st === 0 || (st === 10 && random(22) < .8) || (st === 7 && random(23) < .25)) kick(t, st === 0 ? 1 : .75);
  if (st === 4 || st === 12) hit(t, 'bandpass', 1700, .9, .16, .14);
  if (st % 2 === 0) hit(tt, 'highpass', 7000, .7, (st % 4 === 0 ? .05 : .035) * (.7 + random(24) * .4), .045);
  if ([2, 3, 6, 8, 11, 13].includes(st) && random(25) < .22) lead(tr.scale[Math.floor(random(26) * tr.scale.length)], tt, spb * (2 + random(27) * 3));
}
function scheduler() {
  if (!ctx || !playing) return;
  const tr = TRACKS[track];
  if (tr.url) return;
  while (nextTime < ctx.currentTime + .15) {
    scheduleStep(step, nextTime);
    nextTime += 60 / tr.bpm / 4;
    step = (step + 1) % 16; if (step === 0) bar++;
  }
}

function ui() {
  $('ambBtn').classList.toggle('on', ambOn); $('ambBtn').classList.toggle('ghost', !ambOn);
}

function beginPlayback(startedAt) {
  if (!ctx) return;
  const tr = TRACKS[track];
  const elapsed = Math.max(0, (Date.now() - (Number(startedAt) || Date.now())) / 1000);
  if (tr.url && radioAudio) {
    if (radioAudio.src !== new URL(tr.url, location.href).href) radioAudio.src = tr.url;
    const startMedia = () => {
      if (Number.isFinite(radioAudio.duration) && radioAudio.duration > 0) radioAudio.currentTime = elapsed % radioAudio.duration;
      radioAudio.play().catch(() => {});
    };
    if (radioAudio.readyState >= 1) startMedia();
    else radioAudio.addEventListener('loadedmetadata', startMedia, { once: true });
    musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, .35);
    return;
  }
  const spb = 60 / TRACKS[track].bpm / 4;
  const totalSteps = Math.floor(elapsed / spb);
  step = totalSteps % 16; bar = Math.floor(totalSteps / 16);
  nextTime = ctx.currentTime + Math.max(.025, spb - elapsed % spb);
  delay.delayTime.value = 60 / TRACKS[track].bpm * .75;
  musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, .35);
}

function stopPlayback() {
  if (!ctx) return;
  radioAudio?.pause();
  musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(0, ctx.currentTime, .25);
}

function requestJukebox(nextPlaying, nextTrack = track) {
  nextTrack = Math.max(0, Math.min(TRACKS.length - 1, Math.floor(nextTrack)));
  const startedAt = nextPlaying ? (!playing || nextTrack !== track ? Date.now() : jukebox.startedAt || Date.now()) : null;
  const state = { playing: !!nextPlaying, track: nextTrack, startedAt };
  audioFX.applyJukebox(state);
  S.multiplayer?.setJukebox({ playing: state.playing, track: state.track });
}

export const audioFX = {
  init, ui,
  get playing() { return playing; },
  play() { init(); requestJukebox(true); },
  pause() { requestJukebox(false); },
  toggle() { init(); requestJukebox(!playing); },
  next() {
    init(); requestJukebox(playing, (track + 1) % TRACKS.length);
  },
  applyJukebox(state = {}) {
    const wasPlaying = playing, previousTrack = track;
    track = Math.max(0, Math.min(TRACKS.length - 1, Math.floor(Number(state.track) || 0)));
    playing = !!state.playing;
    jukebox = { playing, track, startedAt: playing ? Number(state.startedAt) || Date.now() : null };
    if (ctx) {
      if (!playing && wasPlaying) stopPlayback();
      else if (playing && (!wasPlaying || track !== previousTrack)) beginPlayback(jukebox.startedAt);
    }
    ui();
  },
  toggleAmb() { init(); ambOn = !ambOn; store.set({ amb: ambOn }); ambBus.gain.setTargetAtTime(ambOn ? 1 : 0, ctx.currentTime, .3); ui(); },
  setWeather(c) {
    if (!ctx) return;
    const t = ctx.currentTime;
    rainG.gain.setTargetAtTime(c.rain * .55, t, .5);
    patterG.gain.setTargetAtTime(c.rain * .05, t, .5);
    windG.gain.setTargetAtTime(c.wind * .22 + c.rain * .03, t, .6);
  },
  thunder(delaySec, close) {
    if (!ctx || !ambOn) return;
    const t = ctx.currentTime + delaySec;
    const s = ctx.createBufferSource(); s.buffer = bn; s.playbackRate.value = rnd(.45, .7);
    const f = filt('lowpass', 300 + close * 500), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5 + close * .9, t + .06 + (1 - close) * .3);
    for (let i = 1; i < 6; i++) g.gain.setTargetAtTime(rnd(.2, .7) * (1 - i / 7) * (.5 + close), t + i * rnd(.25, .5), .15);
    g.gain.setTargetAtTime(0, t + 2.6, .7);
    f.frequency.setTargetAtTime(90, t + .4, 1.2);
    s.connect(f); f.connect(g); g.connect(ambBus); s.start(t, rnd(0, 2)); s.stop(t + 6);
    if (close > .6) hit(t, 'highpass', 900, .7, .35 * close, .35, ambBus);
  },
  level() {
    if (!analyser || !playing) return 0;
    analyser.getByteTimeDomainData(lvlBuf); let s = 0;
    for (let i = 0; i < lvlBuf.length; i++) { const v = (lvlBuf[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / lvlBuf.length) * 6);
  },
};

/* ---------- little sound effects ---------- */
const now = () => ctx.currentTime;
function tone(freq, t, dur, peak, type = 'sine', toFreq) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const g = gain(0); env(g, t, .005, peak, dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + .05);
}
export const sfx = {
  click() { if (!ctx) return; hit(now(), 'highpass', 2500, .7, .25, .03, sfxBus); },
  key() { if (!ctx) return; hit(now(), 'bandpass', rnd(2500, 4000), 1.2, rnd(.15, .25), .035, sfxBus); },
  switch() { if (!ctx) return; hit(now(), 'bandpass', 1800, 2, .35, .025, sfxBus); hit(now() + .03, 'bandpass', 1200, 2, .2, .02, sfxBus); },
  page() { if (!ctx) return; const t = now(); for (let i = 0; i < 3; i++) hit(t + i * .06, 'bandpass', 3200 + i * 400, .8, .12, .12, sfxBus); },
  chess() { if (!ctx) return; tone(820, now(), .08, .25, 'triangle'); tone(560, now() + .25, .08, .25, 'triangle'); },
  sip() { if (!ctx) return; const t = now(); hit(t, 'bandpass', 900, 3, .2, .35, sfxBus); tone(300, t + .4, .12, .1, 'sine', 180); },
  water() { if (!ctx) return; const t = now(); for (let i = 0; i < 8; i++) tone(rnd(500, 1200), t + i * .07, .06, .08, 'sine', rnd(300, 600)); hit(t, 'lowpass', 1500, .7, .12, .6, sfxBus); },
  boot() { if (!ctx) return; const t = now(); tone(523, t, .5, .12); tone(784, t + .15, .6, .1); tone(1046, t + .3, .9, .08); },
  access(granted) { if (!ctx) return; const t = now(); if (granted) { tone(520, t, .13, .16, 'square'); tone(780, t + .14, .16, .16, 'square'); tone(1040, t + .29, .25, .13, 'square'); } else { tone(180, t, .22, .2, 'sawtooth', 110); tone(150, t + .24, .3, .18, 'sawtooth', 80); } },
  bunkerDoor(open) { if (!ctx) return; const t = now(); hit(t, 'bandpass', 420, 1.2, .28, .55, sfxBus); hit(t + .12, 'lowpass', 180, .8, .35, .5, sfxBus); tone(open ? 95 : 125, t, .55, .13, 'sawtooth', open ? 155 : 70); if (!open) tone(55, t + .48, .22, .32, 'sine', 35); },
  orbital() { if (!ctx) return; const t = now(); tone(110, t, 1.6, .2, 'sawtooth', 42); tone(440, t + .08, .5, .11, 'square', 880); tone(660, t + .45, .7, .1, 'square', 1320); for (let i = 0; i < 5; i++) hit(t + .18 + i * .2, 'bandpass', 900 + i * 260, 2, .16, .12, sfxBus); },
  door() { if (!ctx) return; const t = now(); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(160, t + .5); o.frequency.linearRampToValueAtTime(120, t + .9);
    const f = filt('bandpass', 900, 6), g = gain(0); env(g, t, .1, .08, .95); o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1); },
  thunk() { if (!ctx) return; tone(90, now(), .18, .3, 'sine', 50); },
  fridge() { if (!ctx) return; const t = now(); tone(60, t, 1.2, .08, 'sawtooth'); hit(t, 'lowpass', 400, .7, .2, .1, sfxBus); },
  brew() { if (!ctx) return; const t = now(); for (let i = 0; i < 26; i++) tone(rnd(180, 420), t + i * .1 + rnd(0, .05), .07, .06, 'sine', rnd(500, 900)); hit(t, 'bandpass', 1500, .5, .06, 2.8, sfxBus); },
  whoosh() { if (!ctx) return; const t = now(); const s = ctx.createBufferSource(); s.buffer = wn; const f = filt('bandpass', 300, 1), g = gain(0);
    f.frequency.exponentialRampToValueAtTime(2500, t + .5); env(g, t, .15, .3, .8); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + .9);
    for (let i = 0; i < 10; i++) hit(t + .2 + rnd(0, .8), 'highpass', 2000, .7, rnd(.1, .3), .03, sfxBus); },
  purr(dur = 2.5) { if (!ctx) return; const t = now(); const s = ctx.createBufferSource(); s.buffer = bn; const f = filt('lowpass', 380), g = gain(0), am = gain(0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 24; const lg = gain(.5); lfo.connect(lg); lg.connect(am.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.7, t + .3); g.gain.setTargetAtTime(0, t + dur - .4, .2);
    s.connect(f); f.connect(am); am.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + .5); lfo.start(t); lfo.stop(t + dur + .5); },
  meow() { if (!ctx) return; const t = now(); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(600, t); o.frequency.linearRampToValueAtTime(900, t + .15); o.frequency.linearRampToValueAtTime(500, t + .45);
    const f = filt('bandpass', 1400, 3), g = gain(0); env(g, t, .05, .2, .5); o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .55); },
};
