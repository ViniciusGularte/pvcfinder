// HUD wiring: login (nickname + skin), player chip, ambience and view toggle.
import { S } from './core.js';
import { $, store, toast } from './util.js';
import { audioFX } from './audio.js';
import { fetchSkin, defaultSkin, drawHead } from './avatar.js';
import { redrawBoard } from './board.js';

const NICK_RE = /^[A-Za-z0-9_.]{2,16}$/;   // Java names + Bedrock (Geyser) "." prefix

export function initUI() {
  // Music is controlled only by interacting with the radio in the room.
  $('ambBtn').onclick = () => audioFX.toggleAmb();
  $('viewBtn').onclick = () => S.player.toggleView();
  audioFX.ui();

  // login
  const form = $('loginForm'), input = $('nick'), msg = $('loginMsg'), overlay = $('login');
  input.value = store.get().nick || '';
  const preview = defaultSkin();
  drawHead(preview.canvas, $('loginHead'));

  async function join(nick, guest) {
    audioFX.init();   // first user gesture → audio allowed
    let skin = null;
    if (!guest) {
      msg.textContent = 'Fetching your skin…'; form.querySelector('button').disabled = true;
      skin = await fetchSkin(nick);
      form.querySelector('button').disabled = false;
      if (!skin) toast("Couldn't load that skin — using the default look.", 3500);
      store.set({ nick });
    }
    S.nick = nick;
    applySkin(skin || defaultSkin(), nick);
    S.multiplayer?.join(nick);
    overlay.classList.add('gone'); msg.textContent = '';
    redrawBoard();
  }
  form.onsubmit = e => {
    e.preventDefault();
    const nick = input.value.trim();
    if (!NICK_RE.test(nick)) { msg.textContent = 'Nicknames are 2–16 letters, numbers or _'; return; }
    join(nick, false);
  };
  $('guest').onclick = () => join('Guest', true);
  $('meChange').onclick = () => { overlay.classList.remove('gone'); input.focus(); input.select(); };

  // start with the default look until someone joins
  applySkin(defaultSkin(), 'Guest');

  document.querySelectorAll('[data-emote]').forEach(button => {
    button.onclick = () => S.multiplayer?.emote(button.dataset.emote);
  });
}

function applySkin(skin, nick) {
  S.player.avatar.setSkin(skin);
  S.player.avatar.setName(nick);
  drawHead(skin.canvas, $('meHead'));
  $('meName').textContent = nick;
  $('me').classList.remove('hidden');
}
