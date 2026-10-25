/* ==========================================================================
   Spirit Quiz content and scoring (owner: Sonnet). Pure data and one pure function, so
   scripts/test.mjs can check every possible set of answers.

   The quiz is a toy: each answer warms up two or three Noris, and the warmest one is your
   "spirit guardian". It rests on each Nori's LOOKS and a MOOD that those looks suggest
   (a flame that drifts, a calm leaf-sprout, a fluffy cream creature). It says nothing about
   stats, types or lore, and the result screen says so.

   Rules for editing (keep them, they keep the quiz honest and the screen readable):
   • every option names a mood or a place, never a game fact;
   • text is short: a question fits two lines and an option one line (about 27 characters) in
     the phone's dialog box;
   • four options per question, and every Nori must be reachable (npm test checks it).
   ========================================================================== */
window.PL = window.PL || {};

PL.quizData = (function () {
  var ORDER = ['zer', 'saltu', 'corivel', 'denal', 'garnia'];   // also the tie-break order

  /* 'w' = points per Nori: 2 for the best fit, 1 for a near one */
  var QUESTIONS = [
    { q: _('Evening is coming. Where to?'), options: [
      { t: _('Floating over old stones'), w: { zer: 2, garnia: 1 } },
      { t: _('A sunny patch to grow in'), w: { saltu: 2, denal: 1 } },
      { t: _('Somewhere overgrown, hushed'), w: { corivel: 2, saltu: 1 } },
      { t: _('Curled up, soft and warm'), w: { denal: 2, saltu: 1 } },
    ] },
    { q: _('How do you say hello?'), options: [
      { t: _('A soft glow in the dark'), w: { zer: 2, garnia: 1 } },
      { t: _('A fluffy bump of the head'), w: { denal: 2, saltu: 1 } },
      { t: _('A long, quiet look'), w: { corivel: 2, zer: 1 } },
      { t: _('A swoop and a flap'), w: { garnia: 2, corivel: 1 } },
    ] },
    { q: _('Pick a time of day.'), options: [
      { t: _('Morning, dew on everything'), w: { saltu: 2, denal: 1 } },
      { t: _('Mist hour, before sunrise'), w: { corivel: 2, zer: 1 } },
      { t: _('Nap time, mid-afternoon'), w: { denal: 2, saltu: 1 } },
      { t: _('Midnight, all yours'), w: { garnia: 2, zer: 1 } },
    ] },
  ];

  /* one line about the PLAYER per Nori (mood words only); the Nori's own description comes from sky.js */
  var MATCH = {
    zer: _('You like to drift, to glow, and to watch the light.'),
    saltu: _('You like sunny corners, slow growing and quiet company.'),
    corivel: _('You like hushed, overgrown places and long, quiet looks.'),
    denal: _('You like soft, warm places and a good nap.'),
    garnia: _('You like the night, the high places and a good swoop.'),
  };

  /* answers: an option index per question. Returns { scores, winner } (no randomness, so the same
     answers always give the same guardian). A tie goes to the Nori favoured by the LAST answer, then
     to the first in ORDER. */
  function tally(answers) {
    var scores = {};
    ORDER.forEach(function (id) { scores[id] = 0; });
    answers.forEach(function (a, qi) {
      var o = QUESTIONS[qi] && QUESTIONS[qi].options[a];
      if (o) Object.keys(o.w).forEach(function (id) { scores[id] += o.w[id]; });
    });
    return scores;
  }
  function outcome(answers) {
    var scores = tally(answers), last = answers.length ? QUESTIONS[answers.length - 1].options[answers[answers.length - 1]] : null;
    var best = -1, winner = ORDER[0];
    ORDER.forEach(function (id) {
      var tie = last && last.w[id] ? last.w[id] / 10 : 0;     // the last answer breaks ties
      if (scores[id] + tie > best) { best = scores[id] + tie; winner = id; }
    });
    return { winner: winner, scores: scores };
  }

  return { order: ORDER, questions: QUESTIONS, match: MATCH, tally: tally, outcome: outcome };
})();
