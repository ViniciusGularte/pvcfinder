// In-game reader for the official PVC Wiki.
import { S } from './core.js';
import { WIKI_READER } from './config.js';
import { $ } from './util.js';

let wired = false;

export function openWiki() {
  if (S.player?.state === 'sit') S.player.stand();
  const overlay = $('wikiOverlay'), frame = $('wikiFrame'), viewport = $('wikiViewport');
  S.mode = 'wiki';
  overlay.classList.add('open');
  if (!frame.dataset.loaded) {
    viewport.classList.remove('ready');
    frame.src = WIKI_READER;
    frame.dataset.loaded = 'true';
  }
}

function closeWiki() {
  $('wikiOverlay').classList.remove('open');
  if (S.mode === 'wiki') S.mode = 'walk';
}

export function initWiki() {
  if (wired) return;
  wired = true;
  $('wikiFrame').addEventListener('load', () => $('wikiViewport').classList.add('ready'));
  $('wikiClose').onclick = closeWiki;
  addEventListener('keydown', event => {
    if (event.code === 'Escape' && S.mode === 'wiki') closeWiki();
  });
}
