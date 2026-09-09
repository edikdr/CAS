/* ============================================================
   The quiz engine.

   One question at a time. An answer locks the moment it is chosen and the
   correct one is always revealed, so a wrong guess still tells you
   something. You can walk back through what you answered, and the result
   card lists every question with the answer you gave.

   THE OPTIONS ARE SHUFFLED WHEN A DECK STARTS. js/quizzes.js stores the
   correct answer as a string rather than an index; this deals the four
   options into a fresh order with Fisher-Yates and then finds where the
   right one landed. So the answer sits in a different place every play,
   there is no key to memorise, and reading the source tells you nothing
   about position.

   Best scores go in localStorage, which throws in a private window or
   with site data blocked — every touch of it is guarded and the quiz
   behaves identically without it.
   ============================================================ */

const Quiz = {
  overlay: null,
  deck: null,        // the shuffled working copy, never the source
  idx: 0,
  answers: [],       // the option index chosen per question, null while open
  lastFocus: null,

  KEY: 'hu-quiz-best',

  init() {
    this.overlay = document.getElementById('quizModal');
    if (!this.overlay) return;

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); return this.close(); }
      if (e.key === 'Tab') return this.trap(e);
      if (!this.deck) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.step(-1); }
      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        this.answer(Number(e.key) - 1);
      }
    });

    this.renderCards();
  },

  /* ---------- best scores ---------- */
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

  /* ---------- the deck cards on the page ---------- */
  renderCards() {
    const host = document.getElementById('quizGrid');
    if (!host) return;
    const best = this.bests();

    host.innerHTML = QUIZZES.map((q, i) => `
      <button class="quiz-card reveal" type="button" data-deck="${i}">
        <h3>${esc(q.title)}</h3>
        <p>${esc(q.blurb)}</p>
        <span class="quiz-meta">
          <span>${q.questions.length} questions</span>
          <span class="quiz-best">${best[q.id] != null
            ? `best ${best[q.id]}/${q.questions.length}` : 'not played'}</span>
        </span>
      </button>`).join('');

    host.querySelectorAll('[data-deck]').forEach(btn =>
      btn.addEventListener('click', () => this.start(QUIZZES[+btn.dataset.deck])));
    observeReveals(host);
  },

  /* ----------------------------------------------------------
     Deal a deck.

     The source is never mutated: each question is copied, its four
     options shuffled, and the correct index resolved from the answer
     string afterwards. Start the same deck twice and the answers are
     somewhere else both times.
     ---------------------------------------------------------- */
  start(source) {
    const shuffle = arr => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    this.deck = {
      id: source.id,
      title: source.title,
      questions: source.questions.map(q => {
        const options = shuffle(q.o);
        const correct = options.indexOf(q.a);
        /* A question whose answer string is not among its options is a
           typo in the data, and silently scoring it as wrong would hide
           that. Fail loudly instead — in the console, not at the reader. */
        if (correct < 0) Diag.note('quiz', `"${q.a}" is not an option of "${q.q}"`);
        return { q: q.q, options, correct };
      })
    };

    this.idx = 0;
    this.answers = new Array(this.deck.questions.length).fill(null);
    this.lastFocus = document.activeElement;
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    this.render();
  },

  close() {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    this.deck = null;
    document.body.classList.remove('locked');
    this.renderCards();
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  step(dir) {
    if (!this.deck) return;
    const next = this.idx + dir;
    if (next < 0 || next > this.deck.questions.length) return;
    this.idx = next;
    this.render();
  },

  score() {
    return this.answers.reduce((n, chosen, i) =>
      n + (chosen !== null && chosen === this.deck.questions[i].correct ? 1 : 0), 0);
  },

  answer(i) {
    if (!this.deck) return;
    const q = this.deck.questions[this.idx];
    if (!q || this.answers[this.idx] !== null) return;   // locked once chosen
    if (i < 0 || i >= q.options.length) return;
    this.answers[this.idx] = i;
    this.render();
  },

  render() {
    if (!this.deck) return;
    if (this.idx >= this.deck.questions.length) return this.renderResult();

    const q = this.deck.questions[this.idx];
    const chosen = this.answers[this.idx];
    const done = chosen !== null;
    const total = this.deck.questions.length;

    this.overlay.innerHTML = `
      <div class="panel reaped" role="dialog" aria-modal="true" aria-labelledby="qTitle">
        <span class="reaper" aria-hidden="true"></span>
        <button class="close" type="button" aria-label="Close">×</button>

        <div class="q-head">
          <h2 class="q-title" id="qTitle">${esc(this.deck.title)}</h2>
          <span class="q-of">${this.idx + 1} / ${total}</span>
        </div>
        <div class="q-bar"><i style="width:${((this.idx) / total) * 100}%"></i></div>

        <p class="q-q">${esc(q.q)}</p>

        <div class="q-opts" role="group" aria-label="Answers">
          ${q.options.map((opt, i) => {
            const state = !done ? ''
              : i === q.correct ? ' right'
                : i === chosen ? ' wrong' : '';
            return `<button class="q-opt${state}" type="button" data-opt="${i}"
                            ${done ? 'disabled' : ''}>
              <b>${i + 1}</b><span>${esc(opt)}</span>
            </button>`;
          }).join('')}
        </div>

        <div class="q-nav">
          <button type="button" data-nav="prev" ${this.idx === 0 ? 'disabled' : ''}>← Back</button>
          <button type="button" data-nav="next" ${done ? '' : 'disabled'}>
            ${this.idx === total - 1 ? 'Result →' : 'Next →'}</button>
          <span class="q-score">${this.score()} correct · press 1–4</span>
        </div>
      </div>`;

    this.bind();
    this.overlay.querySelectorAll('[data-opt]').forEach(btn =>
      btn.addEventListener('click', () => this.answer(+btn.dataset.opt)));

    const focus = this.overlay.querySelector(done ? '[data-nav="next"]' : '[data-opt="0"]');
    if (focus) focus.focus();
  },

  renderResult() {
    const total = this.deck.questions.length;
    const score = this.score();
    const pct = score / total;
    this.saveBest(this.deck.id, score);

    const badge =
      pct === 1 ? 'Undead' :
        pct >= 0.85 ? 'Usual Suspect' :
          pct >= 0.65 ? 'Day One' :
            pct >= 0.4 ? 'Casual' : 'Tourist';

    const review = this.deck.questions.map((q, i) => {
      const chosen = this.answers[i];
      const ok = chosen === q.correct;
      return `<div class="${ok ? 'ok' : ''}">
        <b>${esc(q.q)}</b>
        <span>${ok
          ? `✓ ${esc(q.options[q.correct])}`
          : `✗ ${chosen === null ? 'not answered' : esc(q.options[chosen])} — it was ${esc(q.options[q.correct])}`}</span>
      </div>`;
    }).join('');

    this.overlay.innerHTML = `
      <div class="panel reaped" role="dialog" aria-modal="true" aria-labelledby="qTitle">
        <span class="reaper" aria-hidden="true"></span>
        <button class="close" type="button" aria-label="Close">×</button>
        <div class="q-result">
          <h2 class="q-badge" id="qTitle">${badge}</h2>
          <p class="q-figure">${score} / ${total} · ${esc(this.deck.title)}</p>
        </div>
        <div class="q-nav">
          <button type="button" data-nav="prev">← Review answers</button>
          <button type="button" data-nav="again">Play again ↻</button>
          <span class="q-score">answers are re-shuffled every play</span>
        </div>
        <div class="q-review">${review}</div>
      </div>`;

    this.bind();
    const again = this.overlay.querySelector('[data-nav="again"]');
    if (again) again.focus();
  },

  bind() {
    this.overlay.querySelector('.close').addEventListener('click', () => this.close());
    const prev = this.overlay.querySelector('[data-nav="prev"]');
    const next = this.overlay.querySelector('[data-nav="next"]');
    const again = this.overlay.querySelector('[data-nav="again"]');
    if (prev) prev.addEventListener('click', () => this.step(-1));
    if (next) next.addEventListener('click', () => this.step(1));
    if (again) again.addEventListener('click', () =>
      this.start(QUIZZES.find(d => d.id === this.deck.id)));
  },

  trap(e) {
    const items = [...this.overlay.querySelectorAll('button:not(:disabled), [href]')]
      .filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
};
