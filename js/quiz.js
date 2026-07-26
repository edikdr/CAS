/* ============================================================
   Four independent quizzes with their own progress and score.
   ============================================================ */

const Quiz = {
  qi: 0,        // quiz index
  i: 0,         // question index
  score: 0,
  answered: false,
  picked: [],   // per-question chosen index, for going back

  init() {
    this.buildTabs();
    this.load(0);

    $('#quizPrev').addEventListener('click', () => this.prev());
    $('#quizNext').addEventListener('click', () => this.next());
    $('#quizRestart').addEventListener('click', () => this.load(this.qi));
  },

  buildTabs() {
    const host = $('#quizTabs');
    host.innerHTML = '';
    QUIZZES.forEach((q, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.textContent = `${q.name} · ${q.questions.length}`;
      b.style.setProperty('--r', ((i % 3) - 1) * 0.7 + 'deg');
      b.addEventListener('click', () => this.load(i));
      host.appendChild(b);
    });
  },

  quiz() { return QUIZZES[this.qi]; },

  load(qi) {
    this.qi = qi;
    this.i = 0;
    this.score = 0;
    this.answered = false;
    this.picked = new Array(QUIZZES[qi].questions.length).fill(null);
    $$('#quizTabs .tab').forEach((t, i) => t.classList.toggle('active', i === qi));
    $('#quizBlurb').textContent = this.quiz().blurb;
    $('#quizStage').hidden = false;
    $('#quizDone').hidden = true;
    this.render();
  },

  render() {
    const q = this.quiz();
    const item = q.questions[this.i];
    const picked = this.picked[this.i];
    this.answered = picked !== null;

    $('#quizWhich').textContent = q.name;
    $('#quizCount').textContent = `${this.i + 1} / ${q.questions.length}`;
    $('#quizBarFill').style.width = ((this.i) / q.questions.length * 100) + '%';
    $('#quizQuestion').textContent = item.q;

    const opts = $('#quizOptions');
    opts.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E'];
    item.options.forEach((text, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      b.dataset.letter = letters[idx];
      b.textContent = text;
      if (this.answered) {
        b.disabled = true;
        if (idx === item.answer) b.classList.add('correct');
        else if (idx === picked) b.classList.add('wrong');
      }
      b.addEventListener('click', () => this.pick(idx));
      opts.appendChild(b);
    });

    const verdict = $('#quizVerdict');
    if (this.answered) {
      const right = picked === item.answer;
      verdict.textContent = right ? 'Correct.' : `Wrong — the answer is “${item.options[item.answer]}”.`;
      verdict.className = 'quiz-verdict ' + (right ? 'good' : 'bad');
    } else {
      verdict.textContent = '';
      verdict.className = 'quiz-verdict';
    }

    $('#quizPrev').disabled = this.i === 0;
    $('#quizNext').textContent = this.i === q.questions.length - 1 ? 'Finish' : 'Next →';
    $('#quizNext').disabled = !this.answered;
  },

  pick(idx) {
    if (this.answered) return;
    const item = this.quiz().questions[this.i];
    this.picked[this.i] = idx;
    if (idx === item.answer) this.score++;
    this.render();
  },

  prev() { if (this.i > 0) { this.i--; this.render(); } },

  next() {
    const q = this.quiz();
    if (this.i < q.questions.length - 1) { this.i++; this.render(); }
    else this.finish();
  },

  finish() {
    const q = this.quiz();
    const total = q.questions.length;
    const pct = Math.round(this.score / total * 100);
    $('#quizStage').hidden = true;
    $('#quizDone').hidden = false;
    $('#quizFinalScore').textContent = `${this.score} / ${total}`;
    $('#quizFinalWord').textContent =
      pct >= 90 ? 'You know the mood better than the algorithm does.'
      : pct >= 70 ? 'Solid. You have done the listening.'
      : pct >= 45 ? 'Somewhere between casual and devoted.'
      : 'Put the records back on.';
    $('#quizBarFill').style.width = '100%';
  }
};
