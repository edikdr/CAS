// Optional scroll sound (TZ §7, P2). Off by default; a visible toggle (user gesture) turns it on.
// Hidden entirely unless features.sfx is true AND media/sfx/ride-loop.mp3 exists in the build.
// Separate Web Audio graph — it never touches the preview <audio> element (engine rule 4).
// gain = baseline + k·|scroll velocity| (smoothed), decays to 0 within ~decayMs after scrolling
// stops; playbackRate rises slightly with speed; ducked to 0 while a preview plays.

export function createSfx({ story, player, i18n }) {
  let cfg, ctx = null, gain = null, src = null, buffer = null, on = false, btn = null, off = null;

  function label() {
    if (!btn) return;
    btn.textContent = i18n.t(on ? 'core.sfx.on' : 'core.sfx.off');
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('title', i18n.t('core.sfx.label'));
  }

  async function start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx ||= new AC();
    await ctx.resume();
    if (!buffer) {
      const res = await fetch(cfg.src);
      buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    }
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    off = story.onFrame(update);
    return true;
  }

  function stop() {
    off?.(); off = null;
    if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const s = src;
    setTimeout(() => { try { s?.stop(); } catch { /* already stopped */ } ctx?.suspend(); }, 300);
    src = null;
  }

  function update(s) {
    if (!gain || !ctx) return;
    const speed = Math.abs(s.velocity || 0); // px/s
    const ducked = player.state === 'playing';
    const target = ducked ? 0 : Math.min(cfg.max, cfg.baseline + cfg.k * speed);
    const rising = target > gain.gain.value;
    // Fast attack, ~decayMs release (time constant ≈ decay/3 → ~95 % gone by decayMs).
    gain.gain.setTargetAtTime(target, ctx.currentTime, rising ? 0.04 : cfg.decayMs / 3000);
    if (src) src.playbackRate.setTargetAtTime(1 + cfg.rateSpan * Math.min(1, speed / 3000), ctx.currentTime, 0.1);
  }

  return {
    get enabled() { return on; },
    init({ config, build }) {
      cfg = { baseline: 0, k: 0.0009, max: 0.55, decayMs: 250, rateSpan: 0.12, src: 'media/sfx/ride-loop.mp3', ...(config.sfx || {}) };
      if (!config.features?.sfx || !build?.sfx) return;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'sfx-toggle';
      btn.className = 'sfx-toggle';
      btn.setAttribute('data-sfx-toggle', '');
      document.body.append(btn);
      btn.addEventListener('click', async () => {
        on = !on;
        label();
        if (on) { try { if (!(await start())) { on = false; label(); } } catch (e) { console.warn('[sfx]', e); on = false; label(); } }
        else stop();
      });
      // The scroll loop's last frame before it sleeps carries ~0 velocity, so the bed fades out.
      document.addEventListener('player:change', () => update({ velocity: 0 }));
      document.addEventListener('i18n:change', label);
      label();
    },
  };
}
