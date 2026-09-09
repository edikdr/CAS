/* ============================================================
   Four decks.

   THE CORRECT ANSWER IS STORED AS A STRING, NOT AN INDEX. js/quiz.js
   shuffles the options every time a deck is started and resolves the
   correct position afterwards, so where the right answer sits changes
   from one play to the next and cannot be learned — or read out of this
   file, which is the more interesting half.

   ON ACCURACY. This was written without a network to check against, so
   it sticks to what is firmly on the record: formation, line-up changes,
   album titles and years, labels, who plays what. Chart positions, sales
   figures and guest credits are left out rather than guessed at, and
   anything genuinely contested — the exact shape of the early label
   history, for one — is not asked as though it had a single clean answer.
   Everything lives in this one file, so a correction is a one-line edit.

   ON "FINISH THE LYRIC". The brief asked for it and this deck does not do
   it, deliberately: printing a band's words to quiz someone on the next
   ones means reproducing them, and no lyric text ships in this folder.
   The Lyrical Genius deck asks about what the songs are doing instead —
   titles, subjects, who delivers what, and where a title was borrowed
   from. It is a better deck for it.
   ============================================================ */

const QUIZZES = [
  {
    id: 'lore',
    title: 'Band Lore & Origins',
    blurb: 'A profile, six masks, and a record deal that arrived after the audience did.',
    questions: [
      { q: 'Which city did Hollywood Undead form in?',
        a: 'Los Angeles',
        o: ['Los Angeles', 'Las Vegas', 'San Diego', 'Sacramento'] },

      { q: 'What year did the band form?',
        a: '2005',
        o: ['2001', '2003', '2005', '2008'] },

      { q: 'Which platform did the band build its following on before signing to a label?',
        a: 'MySpace',
        o: ['MySpace', 'Bandcamp', 'SoundCloud', 'LiveJournal'] },

      { q: 'Who co-founded the band with J-Dog?',
        a: 'Deuce',
        o: ['Deuce', 'Danny', 'Charlie Scene', 'Da Kurlzz'] },

      { q: 'What is the band’s long-standing emblem?',
        a: 'A dove and a grenade',
        o: ['A dove and a grenade', 'A skull and crossbones',
            'A burning palm tree', 'A cracked bell'] },

      { q: 'What was unusual about the band’s position when the industry first noticed them?',
        a: 'They already had a large audience with no album released',
        o: ['They already had a large audience with no album released',
            'They had toured for a decade first',
            'They were signed before writing a song',
            'They had charted under another name'] },

      { q: 'What is the band’s debut album called?',
        a: 'Swan Songs',
        o: ['Swan Songs', 'American Tragedy', 'Day of the Dead', 'Notes from the Underground'] },

      { q: 'What year was the debut released?',
        a: '2008',
        o: ['2006', '2007', '2008', '2010'] },

      { q: 'In what year did Deuce leave the band?',
        a: '2010',
        o: ['2009', '2010', '2012', '2013'] },

      { q: 'Who joined in 2010 to replace him?',
        a: 'Danny',
        o: ['Danny', 'Funny Man', 'Johnny 3 Tears', 'Da Kurlzz'] },

      { q: 'What is J-Dog’s name off stage?',
        a: 'Jorel Decker',
        o: ['Jorel Decker', 'Jordon Terrell', 'George Ragan', 'Dylan Alvarez'] },

      { q: 'What is Johnny 3 Tears’ name off stage?',
        a: 'George Ragan',
        o: ['George Ragan', 'Aron Erlichman', 'Daniel Murillo', 'Matthew St. Claire'] },

      { q: 'What is Danny’s name off stage?',
        a: 'Daniel Murillo',
        o: ['Daniel Murillo', 'Dylan Alvarez', 'Jorel Decker', 'Jordon Terrell'] },

      { q: 'Which member left the band in 2017, after twelve years?',
        a: 'Da Kurlzz',
        o: ['Da Kurlzz', 'Funny Man', 'Charlie Scene', 'Danny'] },

      { q: 'Which state has the band written about, and from, for its whole career?',
        a: 'California',
        o: ['California', 'Nevada', 'Arizona', 'Oregon'] }
    ]
  },

  {
    id: 'masks',
    title: 'Mask Evolution & Personas',
    blurb: 'Six faces, redrawn every album cycle, and the people behind them.',
    questions: [
      { q: 'Whose mask carries three tears under the eye?',
        a: 'Johnny 3 Tears',
        o: ['Johnny 3 Tears', 'J-Dog', 'Danny', 'Funny Man'] },

      { q: 'Which member wears a bandana and a cap rather than a full mask?',
        a: 'Charlie Scene',
        o: ['Charlie Scene', 'Funny Man', 'Da Kurlzz', 'Danny'] },

      { q: 'On the Day of the Dead poster set, whose mask is gold?',
        a: 'Danny',
        o: ['Danny', 'J-Dog', 'Charlie Scene', 'Johnny 3 Tears'] },

      { q: 'Whose mask on that set is plain black, worn under a cap?',
        a: 'Funny Man',
        o: ['Funny Man', 'Da Kurlzz', 'Danny', 'Charlie Scene'] },

      { q: 'Which member played drums and delivered the screamed vocals?',
        a: 'Da Kurlzz',
        o: ['Da Kurlzz', 'Charlie Scene', 'J-Dog', 'Funny Man'] },

      { q: 'What is Charlie Scene’s name off stage?',
        a: 'Jordon Terrell',
        o: ['Jordon Terrell', 'George Ragan', 'Daniel Murillo', 'Jorel Decker'] },

      { q: 'What is Funny Man’s name off stage?',
        a: 'Dylan Alvarez',
        o: ['Dylan Alvarez', 'Matthew St. Claire', 'Aron Erlichman', 'Jordon Terrell'] },

      { q: 'What is Da Kurlzz’s name off stage?',
        a: 'Matthew St. Claire',
        o: ['Matthew St. Claire', 'Dylan Alvarez', 'Daniel Murillo', 'George Ragan'] },

      { q: 'Which member plays lead guitar?',
        a: 'Charlie Scene',
        o: ['Charlie Scene', 'J-Dog', 'Johnny 3 Tears', 'Danny'] },

      { q: 'Which member carries most of the production and programming?',
        a: 'J-Dog',
        o: ['J-Dog', 'Funny Man', 'Da Kurlzz', 'Charlie Scene'] },

      { q: 'Which member brought a straight clean singing voice to the group?',
        a: 'Danny',
        o: ['Danny', 'Deuce', 'Johnny 3 Tears', 'Funny Man'] },

      { q: 'How many masked members appear in the Day of the Dead poster set?',
        a: 'Six',
        o: ['Four', 'Five', 'Six', 'Seven'] },

      { q: 'Which album is named for how many members were left after a departure?',
        a: 'Five',
        o: ['Five', 'Day of the Dead', 'New Empire', 'Notes from the Underground'] },

      { q: 'Which instrument does Johnny 3 Tears play alongside singing?',
        a: 'Bass',
        o: ['Bass', 'Drums', 'Lead guitar', 'Saxophone'] }
    ]
  },

  {
    id: 'words',
    title: 'Lyrical Genius',
    blurb: 'What the songs are about, who delivers them, and where a title was borrowed from.',
    questions: [
      { q: 'Which city functions less as a setting and more as the antagonist across the catalogue?',
        a: 'Los Angeles',
        o: ['Los Angeles', 'New York', 'Detroit', 'Miami'] },

      { q: 'Which song gives every member a verse and names the band to itself?',
        a: '“Undead”',
        o: ['“Undead”', '“Everywhere I Go”', '“Hear Me Now”', '“Gravity”'] },

      { q: 'The title “California Dreaming” borrows from a song originally by which group?',
        a: 'The Mamas & the Papas',
        o: ['The Mamas & the Papas', 'The Beach Boys', 'The Doors', 'Creedence Clearwater Revival'] },

      { q: 'How is “Hotel Kalifornia” spelled on the 2022 album?',
        a: 'With a K',
        o: ['With a K', 'With a C', 'With two Ls', 'In all lower case'] },

      { q: 'Which record pushed furthest towards metal, with the jokes at their thinnest?',
        a: 'Notes from the Underground',
        o: ['Notes from the Underground', 'Swan Songs', 'Five', 'Hotel Kalifornia'] },

      { q: 'On which album did fully sung choruses first appear across the record?',
        a: 'American Tragedy',
        o: ['American Tragedy', 'Swan Songs', 'Day of the Dead', 'Five'] },

      { q: 'Which album cycle produced the six masked posters used on this site?',
        a: 'Day of the Dead',
        o: ['Day of the Dead', 'American Tragedy', 'Five', 'New Empire'] },

      { q: 'Which of these is NOT a Hollywood Undead album?',
        a: 'Paper Tigers',
        o: ['Paper Tigers', 'Swan Songs', 'Five', 'Day of the Dead'] },

      { q: 'What was the band’s output in 2020?',
        a: 'New Empire, in two volumes',
        o: ['New Empire, in two volumes', 'A single live album',
            'Nothing at all', 'A covers record'] },

      { q: 'What does the debut album’s unevenness reflect?',
        a: 'It collects three years of separate uploads',
        o: ['It collects three years of separate uploads',
            'It was recorded in one day',
            'It was written by session musicians',
            'It was a contractual obligation'] },

      { q: 'Which song title reads as a joke about the band’s own presentation — six masked men in a line-up?',
        a: '“Usual Suspects”',
        o: ['“Usual Suspects”', '“Day of the Dead”', '“How We Roll”', '“Disease”'] },

      { q: 'What structural format did the band settle on with its first song and keep?',
        a: 'Passing a song between voices that do not sound alike',
        o: ['Passing a song between voices that do not sound alike',
            'One lead vocalist throughout',
            'Purely instrumental sections',
            'Spoken-word interludes only'] }
    ]
  },

  {
    id: 'deep',
    title: 'Deep Cuts & Discography',
    blurb: 'Running order, labels, and which record a departure landed on.',
    questions: [
      { q: 'Which came first?',
        a: 'American Tragedy',
        o: ['American Tragedy', 'Notes from the Underground', 'Day of the Dead', 'Five'] },

      { q: 'What year was American Tragedy released?',
        a: '2011',
        o: ['2009', '2010', '2011', '2012'] },

      { q: 'What year was Notes from the Underground released?',
        a: '2013',
        o: ['2011', '2012', '2013', '2015'] },

      { q: 'What year was Day of the Dead released?',
        a: '2015',
        o: ['2013', '2014', '2015', '2016'] },

      { q: 'What year was Five released?',
        a: '2017',
        o: ['2015', '2016', '2017', '2019'] },

      { q: 'What year was Hotel Kalifornia released?',
        a: '2022',
        o: ['2019', '2020', '2021', '2022'] },

      { q: 'Which label released Five and Hotel Kalifornia?',
        a: 'BMG',
        o: ['BMG', 'A&M/Octone', 'Domino', 'Roadrunner'] },

      { q: 'Which label released the first three studio albums?',
        a: 'A&M/Octone',
        o: ['A&M/Octone', 'BMG', 'Interscope', 'Epitaph'] },

      { q: 'Which 2009 release was built largely around live recordings?',
        a: 'Desperate Measures',
        o: ['Desperate Measures', 'Swan Songs', 'American Tragedy', 'New Empire'] },

      { q: 'Which studio album sits between Notes from the Underground and Five?',
        a: 'Day of the Dead',
        o: ['Day of the Dead', 'American Tragedy', 'Hotel Kalifornia', 'New Empire, Vol. 1'] },

      { q: 'Which is the first studio album Danny appears on?',
        a: 'American Tragedy',
        o: ['American Tragedy', 'Swan Songs', 'Notes from the Underground', 'Day of the Dead'] },

      { q: 'Which is the first studio album Da Kurlzz does NOT appear on?',
        a: 'Five',
        o: ['Five', 'Day of the Dead', 'Notes from the Underground', 'American Tragedy'] },

      { q: 'How many volumes was New Empire released in?',
        a: 'Two',
        o: ['One', 'Two', 'Three', 'Four'] },

      { q: 'Which of these is a Day of the Dead track?',
        a: '“Usual Suspects”',
        o: ['“Usual Suspects”', '“Hear Me Now”', '“Undead”', '“Whatever It Takes”'] },

      { q: 'What did the band name its 2017 album after?',
        a: 'The number of members remaining',
        o: ['The number of members remaining', 'Its release year',
            'A street in Los Angeles', 'A track from the debut'] }
    ]
  }
];
