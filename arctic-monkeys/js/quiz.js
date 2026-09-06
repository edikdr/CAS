/* ============================================================
   Quizzes

   Four decks, one question at a time. An answer locks once chosen and
   the right one is always shown, so a wrong guess still teaches you
   something. You can walk back through what you answered.

   Best scores are remembered per deck in localStorage, which can throw
   in a private window or with site data blocked — every touch of it is
   guarded and the quiz works the same without it.
   ============================================================ */

const Quiz = {
  overlay: null,
  deck: null,
  idx: 0,
  answers: [],        // index chosen per question, null while unanswered
  lastFocus: null,

  /* ---------- best scores ---------- */
  KEY: 'am-quiz-best',

  bests() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { return {}; }
  },

  saveBest(id, score) {
    try {
      const all = this.bests();
      if (!(id in all) || score > all[id]) {
        all[id] = score;
        localStorage.setItem(this.KEY, JSON.stringify(all));
      }
    } catch { /* nothing to do — the score is still on screen */ }
  },

  /* ---------- the deck cards ---------- */
  renderCards() {
    const host = document.getElementById('quizGrid');
    if (!host) return;
    const best = this.bests();

    host.innerHTML = QUIZZES.map(d => `
      <button class="quiz-card reveal" type="button" data-quiz="${d.id}">
        <span class="q-count">${d.questions.length} questions</span>
        <span class="q-title">${esc(d.title)}</span>
        <span class="q-blurb">${esc(d.blurb)}</span>
        <span class="q-best">${d.id in best
          ? `best ${best[d.id]} / ${d.questions.length}`
          : 'not attempted'}</span>
      </button>`).join('');

    host.querySelectorAll('[data-quiz]').forEach(btn =>
      btn.addEventListener('click', () => this.open(btn.dataset.quiz)));
    observeReveals(host);
  },

  /* ---------- lifecycle ---------- */
  init() {
    this.overlay = document.getElementById('quizModal');
    if (!this.overlay) return;
    this.renderCards();

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); return this.close(); }
      if (e.key === 'Tab') return this.trap(e);
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.go(-1); }
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); this.answer(+e.key - 1); }
    });
  },

  open(id) {
    this.deck = QUIZZES.find(d => d.id === id);
    if (!this.deck) return;
    this.idx = 0;
    this.answers = new Array(this.deck.questions.length).fill(null);
    this.lastFocus = document.activeElement;
    this.render();
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);
    const close = this.overlay.querySelector('.tm-close');
    if (close) close.focus();
  },

  close() {
    if (!this.overlay || this.overlay.hidden) return;
    this.overlay.hidden = true;
    document.body.classList.remove('locked');
    if (this.dust) { this.dust.destroy(); this.dust = null; }
    this.renderCards();          // a new best may have just been set
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  trap(e) {
    const items = [...this.overlay.querySelectorAll('button, [href]')]
      .filter(el => el.offsetParent !== null && !el.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  },

  /* ---------- playing ---------- */
  score() {
    return this.answers.reduce((n, a, i) =>
      n + (a !== null && a === this.deck.questions[i].a ? 1 : 0), 0);
  },

  done() { return this.answers.every(a => a !== null); },

  answer(choice) {
    if (this.idx >= this.deck.questions.length) return;      // on the result card
    if (this.answers[this.idx] !== null) return;             // already locked
    const q = this.deck.questions[this.idx];
    if (choice < 0 || choice >= q.o.length) return;
    this.answers[this.idx] = choice;
    if (this.done()) this.saveBest(this.deck.id, this.score());
    this.render();
  },

  go(step) {
    const last = this.deck.questions.length;               // `last` = result card
    const next = this.idx + step;
    if (next < 0 || next > last) return;
    // do not skip past a question that has not been answered
    if (step > 0 && this.idx < last && this.answers[this.idx] === null) return;
    this.idx = next;
    this.render();
  },

  verdict(score, total) {
    const pct = score / total;
    if (pct === 1) return 'Every one. You have read the sleeve notes twice.';
    if (pct >= 0.85) return 'Nearly faultless.';
    if (pct >= 0.65) return 'Solid. You have done the listening.';
    if (pct >= 0.4) return 'A fair showing — the deep cuts got you.';
    return 'Start at the first album and work forward.';
  },

  render() {
    const deck = this.deck;
    const total = deck.questions.length;
    const onResult = this.idx >= total;
    const answered = this.answers.filter(a => a !== null).length;

    const body = onResult ? this.resultMarkup(total) : this.questionMarkup(total);

    this.overlay.innerHTML = `
      <div class="tm quiz" role="dialog" aria-modal="true" aria-labelledby="qzTitle">
        <button class="tm-close" type="button" aria-label="Close">×</button>

        <header class="qz-head">
          <h3 id="qzTitle" class="tm-title">${esc(deck.title)}</h3>
          <p class="tm-sub">${onResult ? 'Result' : `Question ${this.idx + 1} of ${total}`}
             · ${answered} answered</p>
        </header>

        <div class="qz-bar" role="progressbar" aria-valuemin="0"
             aria-valuemax="${total}" aria-valuenow="${answered}">
          <div class="qz-fill" style="width:${(answered / total * 100).toFixed(1)}%"></div>
        </div>

        ${body}
      </div>`;

    this.overlay.querySelector('.tm-close')
      .addEventListener('click', () => this.close());

    this.overlay.querySelectorAll('[data-opt]').forEach(btn =>
      btn.addEventListener('click', () => this.answer(+btn.dataset.opt)));

    const prev = this.overlay.querySelector('[data-nav="prev"]');
    const next = this.overlay.querySelector('[data-nav="next"]');
    if (prev) prev.addEventListener('click', () => this.go(-1));
    if (next) next.addEventListener('click', () => this.go(1));

    const again = this.overlay.querySelector('[data-nav="again"]');
    if (again) again.addEventListener('click', () => this.open(deck.id));

    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);
  },

  questionMarkup(total) {
    const q = this.deck.questions[this.idx];
    const chosen = this.answers[this.idx];
    const locked = chosen !== null;

    const options = q.o.map((text, i) => {
      const right = i === q.a;
      const cls = !locked ? '' : right ? ' right' : (i === chosen ? ' wrong' : ' dim');
      return `
        <button class="qz-opt${cls}" type="button" data-opt="${i}" ${locked ? 'disabled' : ''}>
          <span class="qz-key">${i + 1}</span>
          <span class="qz-text">${esc(text)}</span>
          ${locked && right ? '<span class="qz-mark">✓</span>' : ''}
          ${locked && i === chosen && !right ? '<span class="qz-mark">✗</span>' : ''}
        </button>`;
    }).join('');

    return `
      <p class="qz-q">${esc(q.q)}</p>
      <div class="qz-opts">${options}</div>
      ${locked
        ? `<p class="qz-after">${chosen === q.a
            ? 'Right.' : `Not quite — it is <strong>${esc(q.o[q.a])}</strong>.`}</p>`
        : '<p class="qz-hint">Pick one, or press 1–4. The answer locks once chosen.</p>'}
      <nav class="tm-nav">
        <button type="button" data-nav="prev" ${this.idx === 0 ? 'disabled' : ''}>← Back</button>
        <span class="tm-of">${this.idx + 1} / ${total}</span>
        <button type="button" data-nav="next" ${locked ? '' : 'disabled'}>
          ${this.idx === total - 1 ? 'See result →' : 'Next →'}
        </button>
      </nav>`;
  },

  resultMarkup(total) {
    const score = this.score();
    const best = this.bests()[this.deck.id];

    const review = this.deck.questions.map((q, i) => {
      const ok = this.answers[i] === q.a;
      return `
        <li class="qz-row ${ok ? 'ok' : 'no'}">
          <span class="qz-row-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="qz-row-q">${esc(q.q)}</span>
          <span class="qz-row-a">${esc(q.o[q.a])}</span>
        </li>`;
    }).join('');

    return `
      <div class="qz-result">
        <div class="qz-score">${score}<span>/${total}</span></div>
        <p class="qz-verdict">${esc(this.verdict(score, total))}</p>
        ${best !== undefined && best !== score
          ? `<p class="qz-best-note">Your best on this deck: ${best} / ${total}</p>` : ''}
      </div>

      <h4 class="tm-h">The answers</h4>
      <ol class="qz-review">${review}</ol>

      <nav class="tm-nav">
        <button type="button" data-nav="prev">← Back through them</button>
        <button type="button" data-nav="again">Take it again</button>
      </nav>`;
  }
};
