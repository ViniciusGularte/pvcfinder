// The radio playback is shared; each player has a local master volume for all lobby audio.
import { $, rnd, store } from './util.js';
import { S } from './core.js';

const TRACKS = [
  { name: "Day · No, I'm Not a Human", url: '/assets/Day%20-%20No%2C%20I%27m%20Not%20a%20Human%20OST%20-%20megaOmega.mp3' },
];
const SLENDER_ROAR_URL = '/assets/SCP-682%20Roar%20-%20SCP-682.mp3';
const SLENDER_ROAR_RANGE = 48;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const saved = store.get();
const MUSIC_LEVEL = .62;
const clampVolume = value => Math.max(0, Math.min(1, Number(value) || 0));
const slenderRoarLevel = (distance, indoors) => {
  if (!Number.isFinite(distance) || distance >= SLENDER_ROAR_RANGE) return 0;
  const proximity = Math.max(0, Math.min(1, (SLENDER_ROAR_RANGE - distance) / (SLENDER_ROAR_RANGE - 4)));
  return Math.pow(proximity, 1.65) * .9 * (indoors ? .28 : 1);
};

let ctx, master, musicGain, musicIn, epBus, delay, analyser, ambBus, sfxBus, rainG, patterG, windG, windF, wn, bn, wow;
let radioAudio = null, slenderRoarAudio = null, slenderRoarGain = null;
// The radio/track is global. Master volume and mute remain personal to this browser.
let playing = false, track = 0;
let masterVolume = Number.isFinite(Number(saved.masterVolume)) ? clampVolume(saved.masterVolume) : .85;
let masterMuted = saved.masterMuted === true || masterVolume === 0;
let lastAudibleVolume = masterVolume > 0 ? masterVolume : .85;
let jukebox = { playing: false, track: 0, startedAt: null };
let step = 0, bar = 0, nextTime = 0;
let nextSlenderStep = 0, slenderFoot = 0;
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
const loop = (buf, dest, offset = 0) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(0, offset); return s; };
const filt = (type, f, q = .7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master = gain(masterMuted ? 0 : masterVolume); master.connect(comp); comp.connect(ctx.destination);
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
  // ambience
  ambBus = gain(1); ambBus.connect(master);
  rainG = gain(0); const rf = filt('lowpass', 1100); loop(bn, rf); rf.connect(rainG); rainG.connect(ambBus);
  patterG = gain(0); const pf = filt('bandpass', 2600, .6); loop(wn, pf, .5); pf.connect(patterG); patterG.connect(ambBus);
  windG = gain(0); windF = filt('bandpass', 500, 1.4); loop(wn, windF, 2); windF.connect(windG); windG.connect(ambBus);
  const wl = ctx.createOscillator(); wl.frequency.value = .08; const wlg = gain(260); wl.connect(wlg); wlg.connect(windF.frequency); wl.start();
  // Do not keep a noise buffer running for the fireplace. Even sparse synthetic
  // crackles leave a low hiss after the first user gesture, regardless of distance.
  // The fire still has its explicit stoke/whoosh interaction without idle noise.

  sfxBus = gain(.8); sfxBus.connect(master);
  slenderRoarGain = gain(0); slenderRoarGain.connect(sfxBus);
  slenderRoarAudio = new Audio(SLENDER_ROAR_URL); slenderRoarAudio.preload = 'auto';
  ctx.createMediaElementSource(slenderRoarAudio).connect(slenderRoarGain);
  // The current radio uses a media file. Do not keep a 40 Hz synthesizer timer alive
  // unless a future track actually needs the procedural scheduler.
  if (TRACKS.some(track => !track.url)) setInterval(scheduler, 25);
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
  const muted = masterMuted || masterVolume === 0;
  const button = $('masterMute'), slider = $('masterVolume'), value = $('masterVolumeValue');
  if (button) {
    button.textContent = muted ? '🔇' : masterVolume < .45 ? '🔈' : '🔊';
    button.title = muted ? 'Unmute all lobby audio' : 'Mute all lobby audio';
    button.setAttribute('aria-pressed', String(muted));
  }
  if (slider) slider.value = Math.round(masterVolume * 100);
  if (value) value.textContent = muted ? 'MUTE' : `${Math.round(masterVolume * 100)}%`;
}

function applyMasterVolume() {
  if (master) master.gain.setTargetAtTime(masterMuted ? 0 : masterVolume, ctx.currentTime, .04);
  store.set({ masterVolume, masterMuted });
  ui();
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
  setMasterVolume(value) {
    masterVolume = clampVolume(value);
    if (masterVolume > 0) { lastAudibleVolume = masterVolume; masterMuted = false; }
    else masterMuted = true;
    applyMasterVolume();
  },
  toggleMute() {
    if (masterMuted || masterVolume === 0) {
      masterMuted = false;
      if (masterVolume === 0) masterVolume = lastAudibleVolume;
    } else masterMuted = true;
    applyMasterVolume();
  },
  setWeather(c) {
    if (!ctx) return;
    const t = ctx.currentTime;
    rainG.gain.setTargetAtTime(c.rain * .55, t, .5);
    patterG.gain.setTargetAtTime(c.rain * .05, t, .5);
    windG.gain.setTargetAtTime(c.wind * .22 + c.rain * .03, t, .6);
  },
  updateSlenderFootsteps(distance, moving) {
    if (!ctx || !moving || masterMuted || masterVolume === 0 || !Number.isFinite(distance) || distance > 36) {
      nextSlenderStep = 0;
      return;
    }
    const t = ctx.currentTime;
    if (nextSlenderStep && t < nextSlenderStep) return;
    const proximity = Math.max(0, Math.min(1, (36 - distance) / 32));
    const peak = .035 + proximity * proximity * .42;
    const cadence = .48 - proximity * .16;
    const foot = slenderFoot++ % 2;
    const thud = ctx.createOscillator(), thudGain = gain(0);
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(78 + foot * 7, t);
    thud.frequency.exponentialRampToValueAtTime(38, t + .16);
    env(thudGain, t, .004, peak, .21);
    thud.connect(thudGain); thudGain.connect(sfxBus);
    thud.onended = () => { thud.disconnect(); thudGain.disconnect(); };
    thud.start(t); thud.stop(t + .24);
    // A quieter heel impact makes the step readable without static or continuous noise.
    const heel = ctx.createOscillator(), heelGain = gain(0);
    heel.type = 'sine'; heel.frequency.setValueAtTime(118, t + .055);
    heel.frequency.exponentialRampToValueAtTime(62, t + .13);
    env(heelGain, t + .055, .003, peak * .38, .12);
    heel.connect(heelGain); heelGain.connect(sfxBus);
    heel.onended = () => { heel.disconnect(); heelGain.disconnect(); };
    heel.start(t + .055); heel.stop(t + .19);
    nextSlenderStep = t + cadence;
  },
  playSlenderRoar(distance, indoors = false) {
    if (!ctx || !slenderRoarAudio || masterMuted || masterVolume === 0) return;
    const level = slenderRoarLevel(distance, indoors);
    if (level <= 0) return;
    slenderRoarGain.gain.cancelScheduledValues(ctx.currentTime);
    slenderRoarGain.gain.setValueAtTime(level, ctx.currentTime);
    slenderRoarAudio.pause(); slenderRoarAudio.currentTime = 0;
    slenderRoarAudio.play().catch(() => {});
  },
  updateSlenderRoar(distance, indoors = false) {
    if (!ctx || !slenderRoarAudio || slenderRoarAudio.paused) return;
    const level = slenderRoarLevel(distance, indoors);
    slenderRoarGain.gain.value = level;
    if (level <= 0) { slenderRoarAudio.pause(); slenderRoarAudio.currentTime = 0; }
  },
  thunder(delaySec, close) {
    if (!ctx || masterMuted || masterVolume === 0) return;
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
