// Ephemeral lobby chat. Messages are relayed live and intentionally not loaded as history.
import { S } from './core.js';
import { $ } from './util.js';

export function initChat() {
  const dock = $('chatDock'), panel = $('chatPanel'), feed = $('chatFeed'), form = $('chatForm'), input = $('chatInput'), unreadEl = $('chatUnread');
  let open = false, unread = 0;

  function setOpen(value) {
    open = value; dock.classList.toggle('open', open);
    if (open) { unread = 0; unreadEl.textContent = ''; input.focus(); feed.scrollTop = feed.scrollHeight; }
  }
  $('chatToggle').onclick = () => setOpen(!open);
  $('chatClose').onclick = () => setOpen(false);
  form.onsubmit = event => {
    event.preventDefault(); const message = input.value.trim(); if (!message) return;
    S.multiplayer?.chat(message); input.value = '';
  };
  addEventListener('keydown', event => {
    if (event.code === 'Enter' && S.mode === 'walk' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); setOpen(true); }
    if (event.code === 'Escape' && open) setOpen(false);
  });

  function receive(row) {
    if (!row?.message) return;
    const item = document.createElement('div'); item.className = row.playerId === S.netId ? 'mine' : '';
    const name = document.createElement('b'), message = document.createElement('span');
    name.textContent = row.name || 'Guest'; message.textContent = row.message;
    item.append(name, message); feed.appendChild(item);
    while (feed.children.length > 12) feed.firstElementChild.remove();
    feed.scrollTop = feed.scrollHeight;
    if (!open) { unread++; unreadEl.textContent = unread > 9 ? '9+' : String(unread); dock.classList.add('peek'); setTimeout(() => dock.classList.remove('peek'), 2800); }
  }

  S.chat = { receive, close: () => setOpen(false) };
}
