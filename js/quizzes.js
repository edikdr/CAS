/* ============================================================
   Four quizzes. answer = index into options.
   ============================================================ */

const QUIZZES = [
  {
    id: 'lore',
    name: 'Lore & Basics',
    blurb: 'Where they came from and how the records happened.',
    questions: [
      { q: 'Which song contains the line “Your lips, my lips, apocalypse”?', options: ['K.', 'Apocalypse', 'Sweet', 'Cry'], answer: 1 },
      { q: 'In which city was the band formed?', options: ['Brooklyn', 'Los Angeles', 'El Paso', 'Austin'], answer: 2 },
      { q: 'What year was the self-titled debut album released?', options: ['2015', '2017', '2019', '2012'], answer: 1 },
      { q: 'Who is the frontman and primary songwriter?', options: ['Randall Miller', 'Jacob Tomsky', 'Greg Gonzalez', 'Phillip Tubbs'], answer: 2 },
      { q: 'Which album features the track “Heavenly”?', options: ['I.', 'Cigarettes After Sex', 'Cry', "X's"], answer: 2 },
      { q: 'The EP “I.” was famously recorded in…', options: ['A basement studio', 'A four-story stairwell', 'An abandoned church', 'A bedroom'], answer: 1 },
      { q: 'What is the name of the 2024 album?', options: ['Cry II', "X's", 'Affection', 'Twizzler'], answer: 1 },
      { q: 'Which member wrote the book “Heads in Beds”?', options: ['Greg Gonzalez', 'Randall Miller', 'Jacob Tomsky', 'Phillip Tubbs'], answer: 2 },
      { q: '“Nothing’s Gonna Hurt You Baby” first appeared on which release?', options: ['Affection', 'I.', 'Cigarettes After Sex', 'Cry'], answer: 1 },
      { q: 'What does the band name reference?', options: ['A cigarette brand', 'A personal intimate moment', 'A film title', 'A poem'], answer: 1 },
      { q: 'Which of these is a cover released by the band?', options: ['Apocalypse', 'Neon Moon', 'Tejano Blue', 'Dark Vacay'], answer: 1 },
      { q: 'The current drummer of the band is…', options: ['Greg Leah', 'Jacob Tomsky', 'Josh Marcus', 'Steve Herrada'], answer: 1 },
      { q: 'Which single was released as a double A-side with “Keep On Loving You”?', options: ['K.', 'Affection', 'Crush', 'Pistol'], answer: 1 },
      { q: 'On which album does the track “Tejano Blue” appear?', options: ['Cry', "X's", 'I.', 'Cigarettes After Sex'], answer: 1 },
      { q: 'Who is primarily responsible for the band’s graphic design?', options: ['Greg Gonzalez', 'Jacob Tomsky', 'Randall Miller', 'Phillip Tubbs'], answer: 2 },
      { q: 'Which song opens the self-titled 2017 album?', options: ['Apocalypse', 'K.', 'Sunsetz', 'Sweet'], answer: 1 },
      { q: '“Sesame Syrup” is the B-side of which single?', options: ['Affection', 'Crush', 'Pistol', 'Bubblegum'], answer: 1 },
      { q: 'Greg Gonzalez originally studied at which university?', options: ['NYU', 'University of Texas at El Paso', 'Berklee', 'UCLA'], answer: 1 }
    ]
  },

  {
    id: 'tracks',
    name: 'Tracks & Albums',
    blurb: 'Track lists, running order, which record holds what.',
    questions: [
      { q: 'Which album opens with “Don’t Let Me Go”?', options: ['Cigarettes After Sex', 'Cry', "X's", 'I.'], answer: 1 },
      { q: '“Silver Sable” appears on which album?', options: ['Cry', "X's", 'Cigarettes After Sex', 'I Can See You'], answer: 1 },
      { q: 'How many tracks are on the self-titled 2017 album?', options: ['9', '10', '11', '12'], answer: 1 },
      { q: 'Which track closes the self-titled album?', options: ['John Wayne', 'Truly', 'Young & Dumb', 'Opera House'], answer: 2 },
      { q: '“Opera House” is found on…', options: ['Cry', 'Cigarettes After Sex', "X's", 'I.'], answer: 1 },
      { q: 'Which album contains both “Touch” and “Pure”?', options: ["X's", 'Cry', 'Cigarettes After Sex', 'I.'], answer: 1 },
      { q: '“Ambien Slide” closes which album?', options: ['Cry', "X's", 'Cigarettes After Sex', 'I.'], answer: 1 },
      { q: 'Which of these is NOT a track on “X’s”?', options: ['Hideaway', 'Hot', 'Heavenly', 'Dark Vacay'], answer: 2 },
      { q: '“Kiss It Off Me” is the second track on which album?', options: ['Cry', "X's", 'Cigarettes After Sex', 'I.'], answer: 0 },
      { q: 'Which EP contains “Starry Eyes” and “I’m a Firefighter”?', options: ['I Can See You', 'I.', 'Affection', 'Crush'], answer: 1 },
      { q: 'Which track opens the album “X’s”?', options: ['Tejano Blue', "X's", 'Hideaway', 'Hot'], answer: 1 },
      { q: '“Hentai” appears on which album?', options: ['Cigarettes After Sex', 'Cry', "X's", 'I.'], answer: 1 },
      { q: 'How many tracks are on “Cry”?', options: ['8', '9', '10', '11'], answer: 1 },
      { q: '“Each Time You Fall in Love” is track two on…', options: ['Cry', 'Cigarettes After Sex', "X's", 'I.'], answer: 1 },
      { q: 'Which of these tracks is the longest on the self-titled album?', options: ['K.', 'Opera House', 'Sweet', 'Apocalypse'], answer: 1 }
    ]
  },

  {
    id: 'releases',
    name: 'Releases & Covers',
    blurb: 'Years, singles, B-sides and the songs they borrowed.',
    questions: [
      { q: 'In which year was the EP “I.” released?', options: ['2009', '2012', '2015', '2017'], answer: 1 },
      { q: '“Neon Moon” is a cover of a song by…', options: ['The Doors', 'Brooks & Dunn', 'REO Speedwagon', 'Radiohead'], answer: 1 },
      { q: '“Motion Picture Soundtrack” is a cover of a song by…', options: ['Radiohead', 'The Cure', 'Mazzy Star', 'The Doors'], answer: 0 },
      { q: '“Keep On Loving You”, the flip side of “Affection”, is originally by…', options: ['Brooks & Dunn', 'REO Speedwagon', 'Fleetwood Mac', 'The Doors'], answer: 1 },
      { q: 'Which label released the self-titled album?', options: ['4AD', 'Partisan Records', 'Sub Pop', 'Matador'], answer: 1 },
      { q: 'In which year was “X’s” released?', options: ['2022', '2023', '2024', '2025'], answer: 2 },
      { q: 'What was the first self-released EP, from 2009?', options: ['I.', 'I Can See You', 'Affection', 'Starry Eyes'], answer: 1 },
      { q: '“Sesame Syrup” was released as the B-side to…', options: ['Crush', 'Bubblegum', 'Pistol', 'Heavenly'], answer: 0 },
      { q: 'In which year was the album “Cry” released?', options: ['2017', '2018', '2019', '2020'], answer: 2 },
      { q: 'The 2025 single “Anna Karenina” came with a cover of which Doors song?', options: ['Riders on the Storm', 'The Crystal Ship', 'People Are Strange', 'The End'], answer: 1 },
      { q: '“Stop Waiting” is the B-side of which single?', options: ['Pistol', 'Bubblegum', 'Twizzler', 'Crush'], answer: 1 },
      { q: 'Which of these singles was released in 2022?', options: ['Pistol', 'Bubblegum', 'Tejano Blue', "You're All I Want"], answer: 0 },
      { q: '“Tejano Blue” served as the lead single from…', options: ['Cry', "X's", 'Cigarettes After Sex', 'I.'], answer: 1 },
      { q: 'Which track has been certified multi-platinum by the RIAA?', options: ['K.', 'Apocalypse', 'Sunsetz', 'Heavenly'], answer: 1 },
      { q: 'In which year did the band form?', options: ['2005', '2008', '2010', '2012'], answer: 1 }
    ]
  },

  {
    id: 'deep',
    name: 'Deep Fan',
    blurb: 'For the ones who read the liner notes.',
    questions: [
      { q: 'Which member is a New York Times bestselling author?', options: ['Greg Gonzalez', 'Randall Miller', 'Jacob Tomsky', 'Josh Marcus'], answer: 2 },
      { q: 'The reverb on the “I.” EP came from…', options: ['A plate reverb unit', 'The stairwell they recorded in', 'A cathedral', 'A tape delay'], answer: 1 },
      { q: 'Besides singing, Greg Gonzalez plays…', options: ['Drums', 'Guitar', 'Saxophone', 'Piano only'], answer: 1 },
      { q: 'Which city did the band relocate to?', options: ['Los Angeles', 'Austin', 'Brooklyn', 'Chicago'], answer: 2 },
      { q: 'Which genre label is most associated with the band?', options: ['Ambient pop', 'Thrash metal', 'Bluegrass', 'Drum and bass'], answer: 0 },
      { q: 'The album “Cry” was largely made in a villa on…', options: ['Ibiza', 'Mallorca', 'Sicily', 'Crete'], answer: 1 },
      { q: 'Which former member played keyboards and electric guitar in the El Paso era?', options: ['Phillip Tubbs', 'Jacob Tomsky', 'Randall Miller', 'Emily Davis'], answer: 0 },
      { q: 'Greg Gonzalez’s vocals are most often described as…', options: ['Gravelly', 'Androgynous and hushed', 'Operatic', 'Shouted'], answer: 1 },
      { q: '“Dreams from Bunker Hill” shares its title with a novel by…', options: ['John Fante', 'Charles Bukowski', 'Joan Didion', 'Raymond Carver'], answer: 0 },
      { q: 'El Paso is in which US state?', options: ['New Mexico', 'Arizona', 'Texas', 'Nevada'], answer: 2 },
      { q: 'Which platform’s recommendation algorithm helped the early material find a mass audience?', options: ['MySpace', 'YouTube', 'SoundCloud', 'Bandcamp'], answer: 1 },
      { q: 'Who plays bass in the current line-up?', options: ['Randall Miller', 'Greg Leah', 'Steve Herrada', 'Emily Davis'], answer: 0 },
      { q: 'Which instrument did Emily Davis contribute to the earliest recordings?', options: ['Acoustic guitar', 'Cello', 'Synthesiser', 'Trumpet'], answer: 0 },
      { q: 'How many years separate the self-titled debut and “X’s”?', options: ['Five', 'Six', 'Seven', 'Nine'], answer: 2 },
      { q: 'The visual identity of the records is dominated by…', options: ['Neon colour', 'Stark black and white', 'Pastel gradients', 'Hand-drawn cartoons'], answer: 1 }
    ]
  }
];
