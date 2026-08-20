/* ============================================================
   Four quizzes. answer = index into options.
   ============================================================ */

const QUIZZES = [
  {
    "id": "lore",
    "name": "Lore & Basics",
    "blurb": "Where they came from and how the records happened.",
    "questions": [
      {
        "q": "Which song contains the line “Your lips, my lips, apocalypse”?",
        "options": [
          "Apocalypse",
          "Sweet",
          "K.",
          "Cry"
        ],
        "answer": 0
      },
      {
        "q": "In which city was the band formed?",
        "options": [
          "Brooklyn",
          "El Paso",
          "Los Angeles",
          "Austin"
        ],
        "answer": 1
      },
      {
        "q": "What year was the self-titled debut album released?",
        "options": [
          "2012",
          "2015",
          "2017",
          "2019"
        ],
        "answer": 2
      },
      {
        "q": "Who is the frontman and primary songwriter?",
        "options": [
          "Phillip Tubbs",
          "Greg Gonzalez",
          "Randall Miller",
          "Jacob Tomsky"
        ],
        "answer": 1
      },
      {
        "q": "Which album features the track “Heavenly”?",
        "options": [
          "I.",
          "Cigarettes After Sex",
          "X's",
          "Cry"
        ],
        "answer": 3
      },
      {
        "q": "The EP “I.” was famously recorded in…",
        "options": [
          "A basement studio",
          "An abandoned church",
          "A four-story stairwell",
          "A bedroom"
        ],
        "answer": 2
      },
      {
        "q": "What is the name of the 2024 album?",
        "options": [
          "Affection",
          "X's",
          "Cry II",
          "Twizzler"
        ],
        "answer": 1
      },
      {
        "q": "Which member wrote the book “Heads in Beds”?",
        "options": [
          "Phillip Tubbs",
          "Randall Miller",
          "Greg Gonzalez",
          "Jacob Tomsky"
        ],
        "answer": 3
      },
      {
        "q": "“Nothing’s Gonna Hurt You Baby” first appeared on which release?",
        "options": [
          "Cigarettes After Sex",
          "Affection",
          "Cry",
          "I."
        ],
        "answer": 3
      },
      {
        "q": "What does the band name reference?",
        "options": [
          "A poem",
          "A personal intimate moment",
          "A cigarette brand",
          "A film title"
        ],
        "answer": 1
      },
      {
        "q": "Which of these is a cover released by the band?",
        "options": [
          "Tejano Blue",
          "Neon Moon",
          "Dark Vacay",
          "Apocalypse"
        ],
        "answer": 1
      },
      {
        "q": "The current drummer of the band is…",
        "options": [
          "Josh Marcus",
          "Jacob Tomsky",
          "Greg Leah",
          "Steve Herrada"
        ],
        "answer": 1
      },
      {
        "q": "Which single was released as a double A-side with “Keep On Loving You”?",
        "options": [
          "K.",
          "Crush",
          "Pistol",
          "Affection"
        ],
        "answer": 3
      },
      {
        "q": "On which album does the track “Tejano Blue” appear?",
        "options": [
          "I.",
          "Cry",
          "Cigarettes After Sex",
          "X's"
        ],
        "answer": 3
      },
      {
        "q": "Who is primarily responsible for the band’s graphic design?",
        "options": [
          "Jacob Tomsky",
          "Randall Miller",
          "Greg Gonzalez",
          "Phillip Tubbs"
        ],
        "answer": 1
      },
      {
        "q": "Which song opens the self-titled 2017 album?",
        "options": [
          "K.",
          "Apocalypse",
          "Sweet",
          "Sunsetz"
        ],
        "answer": 0
      },
      {
        "q": "“Sesame Syrup” is the B-side of which single?",
        "options": [
          "Bubblegum",
          "Affection",
          "Crush",
          "Pistol"
        ],
        "answer": 2
      },
      {
        "q": "Greg Gonzalez originally studied at which university?",
        "options": [
          "Berklee",
          "University of Texas at El Paso",
          "NYU",
          "UCLA"
        ],
        "answer": 1
      }
    ]
  },
  {
    "id": "tracks",
    "name": "Tracks & Albums",
    "blurb": "Track lists, running order, which record holds what.",
    "questions": [
      {
        "q": "Which album opens with “Don’t Let Me Go”?",
        "options": [
          "I.",
          "X's",
          "Cry",
          "Cigarettes After Sex"
        ],
        "answer": 2
      },
      {
        "q": "“Silver Sable” appears on which album?",
        "options": [
          "Cigarettes After Sex",
          "Cry",
          "I Can See You",
          "X's"
        ],
        "answer": 3
      },
      {
        "q": "How many tracks are on the self-titled 2017 album?",
        "options": [
          "9",
          "12",
          "10",
          "11"
        ],
        "answer": 2
      },
      {
        "q": "Which track closes the self-titled album?",
        "options": [
          "John Wayne",
          "Truly",
          "Opera House",
          "Young & Dumb"
        ],
        "answer": 3
      },
      {
        "q": "“Opera House” is found on…",
        "options": [
          "I.",
          "Cigarettes After Sex",
          "X's",
          "Cry"
        ],
        "answer": 1
      },
      {
        "q": "Which album contains both “Touch” and “Pure”?",
        "options": [
          "Cry",
          "I.",
          "X's",
          "Cigarettes After Sex"
        ],
        "answer": 0
      },
      {
        "q": "“Ambien Slide” closes which album?",
        "options": [
          "Cigarettes After Sex",
          "X's",
          "Cry",
          "I."
        ],
        "answer": 1
      },
      {
        "q": "Which of these is NOT a track on “X’s”?",
        "options": [
          "Heavenly",
          "Hideaway",
          "Dark Vacay",
          "Hot"
        ],
        "answer": 0
      },
      {
        "q": "“Kiss It Off Me” is the second track on which album?",
        "options": [
          "Cigarettes After Sex",
          "Cry",
          "I.",
          "X's"
        ],
        "answer": 1
      },
      {
        "q": "Which EP contains “Starry Eyes” and “I’m a Firefighter”?",
        "options": [
          "I Can See You",
          "Crush",
          "Affection",
          "I."
        ],
        "answer": 3
      },
      {
        "q": "Which track opens the album “X’s”?",
        "options": [
          "X's",
          "Tejano Blue",
          "Hideaway",
          "Hot"
        ],
        "answer": 0
      },
      {
        "q": "“Hentai” appears on which album?",
        "options": [
          "Cigarettes After Sex",
          "I.",
          "Cry",
          "X's"
        ],
        "answer": 2
      },
      {
        "q": "How many tracks are on “Cry”?",
        "options": [
          "9",
          "10",
          "8",
          "11"
        ],
        "answer": 0
      },
      {
        "q": "“Each Time You Fall in Love” is track two on…",
        "options": [
          "I.",
          "Cigarettes After Sex",
          "Cry",
          "X's"
        ],
        "answer": 1
      },
      {
        "q": "Which of these tracks is the longest on the self-titled album?",
        "options": [
          "K.",
          "Sweet",
          "Apocalypse",
          "Opera House"
        ],
        "answer": 3
      }
    ]
  },
  {
    "id": "releases",
    "name": "Releases & Covers",
    "blurb": "Years, singles, B-sides and the songs they borrowed.",
    "questions": [
      {
        "q": "In which year was the EP “I.” released?",
        "options": [
          "2015",
          "2017",
          "2012",
          "2009"
        ],
        "answer": 2
      },
      {
        "q": "“Neon Moon” is a cover of a song by…",
        "options": [
          "The Doors",
          "Brooks & Dunn",
          "Radiohead",
          "REO Speedwagon"
        ],
        "answer": 1
      },
      {
        "q": "“Motion Picture Soundtrack” is a cover of a song by…",
        "options": [
          "Mazzy Star",
          "The Cure",
          "Radiohead",
          "The Doors"
        ],
        "answer": 2
      },
      {
        "q": "“Keep On Loving You”, the flip side of “Affection”, is originally by…",
        "options": [
          "Brooks & Dunn",
          "The Doors",
          "REO Speedwagon",
          "Fleetwood Mac"
        ],
        "answer": 2
      },
      {
        "q": "Which label released the self-titled album?",
        "options": [
          "Sub Pop",
          "Partisan Records",
          "4AD",
          "Matador"
        ],
        "answer": 1
      },
      {
        "q": "In which year was “X’s” released?",
        "options": [
          "2023",
          "2024",
          "2022",
          "2025"
        ],
        "answer": 1
      },
      {
        "q": "What was the first self-released EP, from 2009?",
        "options": [
          "I Can See You",
          "I.",
          "Starry Eyes",
          "Affection"
        ],
        "answer": 0
      },
      {
        "q": "“Sesame Syrup” was released as the B-side to…",
        "options": [
          "Heavenly",
          "Crush",
          "Bubblegum",
          "Pistol"
        ],
        "answer": 1
      },
      {
        "q": "In which year was the album “Cry” released?",
        "options": [
          "2017",
          "2018",
          "2019",
          "2020"
        ],
        "answer": 2
      },
      {
        "q": "The 2025 single “Anna Karenina” came with a cover of which Doors song?",
        "options": [
          "People Are Strange",
          "Riders on the Storm",
          "The End",
          "The Crystal Ship"
        ],
        "answer": 3
      },
      {
        "q": "“Stop Waiting” is the B-side of which single?",
        "options": [
          "Crush",
          "Bubblegum",
          "Pistol",
          "Twizzler"
        ],
        "answer": 1
      },
      {
        "q": "Which of these singles was released in 2022?",
        "options": [
          "You're All I Want",
          "Pistol",
          "Tejano Blue",
          "Bubblegum"
        ],
        "answer": 1
      },
      {
        "q": "“Tejano Blue” served as the lead single from…",
        "options": [
          "I.",
          "Cigarettes After Sex",
          "Cry",
          "X's"
        ],
        "answer": 3
      },
      {
        "q": "Which track has been certified multi-platinum by the RIAA?",
        "options": [
          "K.",
          "Apocalypse",
          "Heavenly",
          "Sunsetz"
        ],
        "answer": 1
      },
      {
        "q": "In which year did the band form?",
        "options": [
          "2005",
          "2010",
          "2012",
          "2008"
        ],
        "answer": 3
      }
    ]
  },
  {
    "id": "deep",
    "name": "Deep Fan",
    "blurb": "For the ones who read the liner notes.",
    "questions": [
      {
        "q": "Which member is a New York Times bestselling author?",
        "options": [
          "Jacob Tomsky",
          "Randall Miller",
          "Greg Gonzalez",
          "Josh Marcus"
        ],
        "answer": 0
      },
      {
        "q": "The reverb on the “I.” EP came from…",
        "options": [
          "A plate reverb unit",
          "A tape delay",
          "The stairwell they recorded in",
          "A cathedral"
        ],
        "answer": 2
      },
      {
        "q": "Besides singing, Greg Gonzalez plays…",
        "options": [
          "Piano only",
          "Guitar",
          "Drums",
          "Saxophone"
        ],
        "answer": 1
      },
      {
        "q": "Which city did the band relocate to?",
        "options": [
          "Los Angeles",
          "Brooklyn",
          "Chicago",
          "Austin"
        ],
        "answer": 1
      },
      {
        "q": "Which genre label is most associated with the band?",
        "options": [
          "Thrash metal",
          "Drum and bass",
          "Ambient pop",
          "Bluegrass"
        ],
        "answer": 2
      },
      {
        "q": "The album “Cry” was largely made in a villa on…",
        "options": [
          "Ibiza",
          "Mallorca",
          "Sicily",
          "Crete"
        ],
        "answer": 1
      },
      {
        "q": "Which former member played keyboards and electric guitar in the El Paso era?",
        "options": [
          "Phillip Tubbs",
          "Emily Davis",
          "Jacob Tomsky",
          "Randall Miller"
        ],
        "answer": 0
      },
      {
        "q": "Greg Gonzalez’s vocals are most often described as…",
        "options": [
          "Gravelly",
          "Androgynous and hushed",
          "Operatic",
          "Shouted"
        ],
        "answer": 1
      },
      {
        "q": "“Dreams from Bunker Hill” shares its title with a novel by…",
        "options": [
          "Joan Didion",
          "Raymond Carver",
          "Charles Bukowski",
          "John Fante"
        ],
        "answer": 3
      },
      {
        "q": "El Paso is in which US state?",
        "options": [
          "Texas",
          "Nevada",
          "Arizona",
          "New Mexico"
        ],
        "answer": 0
      },
      {
        "q": "Which platform’s recommendation algorithm helped the early material find a mass audience?",
        "options": [
          "Bandcamp",
          "MySpace",
          "SoundCloud",
          "YouTube"
        ],
        "answer": 3
      },
      {
        "q": "Who plays bass in the current line-up?",
        "options": [
          "Greg Leah",
          "Steve Herrada",
          "Emily Davis",
          "Randall Miller"
        ],
        "answer": 3
      },
      {
        "q": "Which instrument did Emily Davis contribute to the earliest recordings?",
        "options": [
          "Synthesiser",
          "Trumpet",
          "Acoustic guitar",
          "Cello"
        ],
        "answer": 2
      },
      {
        "q": "How many years separate the self-titled debut and “X’s”?",
        "options": [
          "Seven",
          "Nine",
          "Five",
          "Six"
        ],
        "answer": 0
      },
      {
        "q": "The visual identity of the records is dominated by…",
        "options": [
          "Stark black and white",
          "Neon colour",
          "Hand-drawn cartoons",
          "Pastel gradients"
        ],
        "answer": 0
      }
    ]
  }
];
