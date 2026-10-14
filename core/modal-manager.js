/*
 * core/modal-manager.js - every window on the site (CONTRACT sections 5 and 7).
 *
 * Public API:
 *   ModalManager.register(kind, { render, className? })
 *       render(body, payload, api) -> cleanup?   fills the dialog; api = { close(), setTitle(text), dialog }
 *       kinds: 'about' | 'quiz' | 'receipt' | 'track' | 'merch' (core registers 'track')
 *   ModalManager.open(kind, payload) -> the dialog element (null for an unknown kind)
 *   ModalManager.close()            closes the top modal
 *   ModalManager.current            { kind, payload } of the top modal, or null
 *   ModalManager.on('open' | 'close', fn({ kind, payload }))
 *
 * Behaviour (no feature has to repeat it):
 *  - native <dialog>.showModal(): the page behind is inert and focus stays inside;
 *  - Esc, the close button, a tap on the empty dialog area and the phone's Back button all close
 *    the top modal (each open pushes one history entry; closing pops it);
 *  - focus returns to the element that opened the modal;
 *  - the preview audio stops on every close;
 *  - modals stack (a receipt opens a track); <html class="modal-open"> while any is open.
 *
 * Must not change: API names, the "audio stops on close" and history behaviour.
 */

import { createEmitter } from './emitter.js';
import { PreviewPlayer } from './preview-player.js';

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const kinds = new Map();
const stack = [];
const events = createEmitter();
let seq = 0;

function finish(entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  try { entry.cleanup?.(); } catch (e) { console.error(e); }
  PreviewPlayer.pause();
  entry.dialog.close();
  entry.dialog.remove();
  document.documentElement.classList.toggle('modal-open', stack.length > 0);
  if (entry.opener?.isConnected) entry.opener.focus({ preventScroll: true });
  events.emit('close', { kind: entry.kind, payload: entry.payload });
}

/** Close the top modal through history, so Back and the UI stay in step. */
function requestClose() {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (history.state?.modal === top.id) history.back();
  else finish(top);
}

addEventListener('popstate', (e) => {
  const keep = e.state?.modal ?? 0;
  while (stack.length && stack[stack.length - 1].id > keep) finish(stack[stack.length - 1]);
});

export const ModalManager = {
  register(kind, def) {
    kinds.set(kind, def);
  },

  open(kind, payload = {}) {
    const def = kinds.get(kind);
    if (!def) {
      console.warn(`ModalManager: no renderer registered for "${kind}"`);
      return null;
    }
    const id = ++seq;
    const dialog = document.createElement('dialog');
    dialog.className = `modal modal--${kind}${def.className ? ` ${def.className}` : ''}`;
    dialog.setAttribute('aria-labelledby', `modal-title-${id}`);
    dialog.innerHTML = `<div class="modal__panel"><button class="modal__close icon-button" type="button" aria-label="Close">${CLOSE_ICON}</button><h2 class="modal__title" id="modal-title-${id}"></h2><div class="modal__body"></div></div>`;
    const entry = { id, kind, payload, dialog, opener: document.activeElement, cleanup: null };
    const api = {
      close: requestClose,
      setTitle: (text) => { dialog.querySelector('.modal__title').textContent = text; },
      dialog,
    };

    dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) requestClose(); });
    dialog.querySelector('.modal__close').addEventListener('click', requestClose);

    document.body.append(dialog);
    stack.push(entry);
    history.pushState({ ...history.state, modal: id }, '');
    document.documentElement.classList.add('modal-open');
    entry.cleanup = def.render(dialog.querySelector('.modal__body'), payload, api) || null;
    dialog.showModal();
    events.emit('open', { kind, payload });
    return dialog;
  },

  close: requestClose,
  get current() {
    const top = stack[stack.length - 1];
    return top ? { kind: top.kind, payload: top.payload } : null;
  },
  on: events.on,
};
