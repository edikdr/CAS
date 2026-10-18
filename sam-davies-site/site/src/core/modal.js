// SD.modal — generic, one modal at a time (TZ §6A).
// Focus trap · Esc / backdrop / [data-modal-close] close · focus returns to the opener ·
// background inert · scroll lock that keeps the exact scroll position · mobile Back closes it
// (one history entry per open, popped again on UI close, so repeated open/close adds nothing).
import { root, $, emit, afterTransition } from './util.js';

const INERT = ['#story', '#main', '#footer', '#island'];
const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),audio[controls],video[controls],[contenteditable="true"]';
const hasInert = 'inert' in HTMLElement.prototype;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export function createModal() {
  let openEl = null;
  let returnTo = null;
  let lockY = 0;
  let pushed = false; // our history entry is on top
  let expectPops = 0; // history.back() calls we issued and whose popstate is still due
  let popWaiters = [];
  let gen = 0;

  const api = {
    get isOpen() { return Boolean(openEl); },
    get current() { return openEl; },
    open, close,
  };

  function resolve(elOrId) {
    return typeof elOrId === 'string' ? document.getElementById(elOrId.replace(/^#/, '')) : elOrId;
  }

  function setInert(on) {
    for (const sel of INERT) {
      const el = $(sel);
      if (!el) continue;
      if (hasInert) el.inert = on;
      else if (on) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
  }

  function lock() {
    lockY = scrollY;
    const sbw = Math.max(0, innerWidth - root.clientWidth);
    root.style.setProperty('--sbw', `${sbw}px`);
    root.style.setProperty('--sd-lock-top', `${-lockY}px`);
    root.classList.add('sd-scroll-lock');
  }

  function unlock() {
    root.classList.remove('sd-scroll-lock');
    root.style.removeProperty('--sd-lock-top');
    root.style.removeProperty('--sbw');
    scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  }

  const focusables = (el) => [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length && !n.closest('[inert]'));

  function focusInitial(el) {
    const target = el.querySelector('[autofocus]') || el.querySelector('.modal__panel[tabindex]') || focusables(el)[0] || el;
    if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  function waitForPop() {
    if (!expectPops) return Promise.resolve();
    return new Promise((r) => {
      popWaiters.push(r);
      setTimeout(r, 400); // never hang if a browser swallows the popstate
    });
  }

  async function open(elOrId, { returnFocus } = {}) {
    const el = resolve(elOrId);
    if (!el) return null;
    if (openEl === el) return el;
    const swapping = Boolean(openEl);
    if (swapping) closeNow({ swap: true });
    else {
      returnTo = returnFocus || document.activeElement;
      lock();
      setInert(true);
    }
    const my = ++gen;
    openEl = el;
    el.hidden = false;
    root.dataset.modal = 'open';
    if (!pushed) {
      await waitForPop(); // a previous close's history.back() must land first
      if (openEl !== el) return null;
      history.pushState({ ...(history.state || {}), sdModal: el.id || true }, '');
      pushed = true;
    }
    focusInitial(el);
    emit('modal:open', { id: el.id });
    await nextFrame();
    if (my !== gen || openEl !== el) return el;
    el.classList.add('is-open');
    await afterTransition(el);
    return el;
  }

  /** Synchronous part of closing; returns the element that was open. */
  function closeNow({ fromPop = false, swap = false } = {}) {
    const el = openEl;
    if (!el) return null;
    openEl = null;
    ++gen;
    el.classList.remove('is-open');
    afterTransition(el).then(() => { if (openEl !== el) el.hidden = true; }); // unless reopened meanwhile
    if (swap) { emit('modal:close', { id: el.id, swap: true }); return el; }
    setInert(false);
    unlock(); // exact scroll position is back BEFORE anyone hears modal:close
    root.dataset.modal = 'closed';
    if (pushed) {
      pushed = false;
      if (!fromPop) { expectPops++; history.back(); }
    }
    emit('modal:close', { id: el.id });
    const target = returnTo;
    returnTo = null;
    if (target?.isConnected && target.getClientRects().length && !target.closest('[inert],[hidden]')) target.focus({ preventScroll: true });
    return el;
  }

  async function close(opts) {
    const el = closeNow(opts);
    if (el) await afterTransition(el);
  }

  api.init = () => {
    // A reload while a modal was open leaves our marker in history.state; drop it.
    if (history.state?.sdModal) {
      const { sdModal, ...rest } = history.state;
      history.replaceState(Object.keys(rest).length ? rest : null, '');
    }
    addEventListener('popstate', (e) => {
      if (expectPops > 0) {
        expectPops--;
        const w = popWaiters; popWaiters = [];
        w.forEach((r) => r());
        return;
      }
      if (openEl && !e.state?.sdModal) { pushed = false; closeNow({ fromPop: true }); }
    });
    document.addEventListener('click', (e) => {
      if (!openEl) return;
      const closer = e.target.closest?.('[data-modal-close]');
      if (closer && openEl.contains(closer)) { e.preventDefault(); close(); }
    });
    document.addEventListener('keydown', (e) => {
      if (!openEl) return;
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables(openEl);
      if (!list.length) { e.preventDefault(); openEl.querySelector('.modal__panel[tabindex]')?.focus({ preventScroll: true }); return; }
      const first = list[0], last = list[list.length - 1], active = document.activeElement;
      const inside = openEl.contains(active) && list.includes(active);
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus({ preventScroll: true }); }
    });
    // Focus that escapes (e.g. a click outside on the language switch) is brought back.
    document.addEventListener('focusin', (e) => {
      if (openEl && !openEl.contains(e.target) && !e.target.closest?.('#lang-switch')) focusInitial(openEl);
    });
    return api;
  };

  return api;
}
