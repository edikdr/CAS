/* ============================================================
   Arctic Monkeys — data layer
   Members, discography, per-track credits, lore and the
   platform links each track opens on.

   Track names / years / durations are the released studio
   versions. Preview audio and artwork are resolved at runtime
   from the iTunes Search API (see js/player.js); everything
   here works with the network switched off.
   ============================================================ */

const BAND = {
  name: 'Arctic Monkeys',
  formed: 2002,
  origin: 'High Green, Sheffield, England',
  label: 'Domino Recording Company',
  genres: 'Indie rock · garage rock · psychedelic rock · lounge pop'
};

/* ------------------------------------------------------------
   Line-up
   ------------------------------------------------------------ */
const MEMBERS = [
  {
    name: 'Alex Turner',
    role: 'Lead vocals · Guitar · Piano · Songwriter',
    status: 'current',
    initials: 'AT',
    born: '6 January 1986 — High Green, Sheffield',
    years: '2002 — present',
    instruments: 'Voice, electric guitar, piano, Steinway Vertegrand',
    bio: 'Writes the words. The voice that moved from a Sheffield taxi rank to a lunar lounge bar without ever quite losing the accent.',
    extra: [
      'Got his first guitar at Christmas 2001, aged fifteen — the same Christmas as Jamie Cook. The band existed by the following year.',
      'Writes nearly every Arctic Monkeys lyric. The early records are reportage: chip shops, bouncers, taxi ranks, the specific boredom of a Sheffield night bus. By <em>Tranquility Base Hotel &amp; Casino</em> the same eye is pointed at a hotel on the Moon, and by <em>The Car</em> at a soundstage that keeps dissolving.',
      'Also half of The Last Shadow Puppets with Miles Kane — two albums of orchestral drama that fed straight back into the Monkeys’ later strings.',
      'Wore the "Who the fuck are Arctic Monkeys?" t-shirt to the 2006 Brit Awards, after a journalist used the phrase to dismiss them. They had, by then, the fastest-selling debut album in British chart history.'
    ],
    notable: 'Wrote “A Certain Romance”, “505”, “Do I Wanna Know?”, “Star Treatment”, “Body Paint”.'
  },
  {
    name: 'Jamie Cook',
    role: 'Guitar',
    status: 'current',
    initials: 'JC',
    born: '8 July 1985 — Sheffield',
    years: '2002 — present',
    instruments: 'Electric guitar, keyboards',
    bio: 'The other guitar. Rarely speaks in interviews, has been in the band since the first Christmas guitar.',
    extra: [
      'Founded the band with Turner in 2002 after both were given guitars for Christmas. Neither could play.',
      'His playing is the band’s rhythm spine — the clipped, wiry figures under “Brianstorm” and “Balaclava”, the desert fuzz across <em>Humbug</em>, the sustained shimmer on <em>The Car</em>.',
      'Quietly responsible for a lot of the arrangement decisions that keep the records from tipping into pastiche.'
    ],
    notable: 'Guitar on every release since 2006.'
  },
  {
    name: "Nick O'Malley",
    role: 'Bass · Backing vocals',
    status: 'current',
    initials: 'NO',
    born: '5 July 1985 — Sheffield',
    years: '2006 — present',
    instruments: 'Bass guitar, backing vocals',
    bio: 'Joined mid-2006 on an emergency basis and never left. The high harmony you hear behind Turner is usually his.',
    extra: [
      'Stepped in when Andy Nicholson left during the American leg of the 2006 tour — initially as a stand-in, permanently by the end of it.',
      'His first full record with the band was <em>Favourite Worst Nightmare</em>, which opens with “Brianstorm”: a bassline that does not stop moving for two minutes and fifty seconds.',
      'Sings the harmonies that give the later material its lounge-act sweetness — the “oohs” on “Four Out of Five” are the sound of the band deciding to be a different band.'
    ],
    notable: 'Bass from <em>Favourite Worst Nightmare</em> onward.'
  },
  {
    name: 'Matt Helders',
    role: 'Drums · Backing vocals',
    status: 'current',
    initials: 'MH',
    born: '7 June 1986 — Sheffield',
    years: '2002 — present',
    instruments: 'Drums, percussion, backing vocals',
    bio: 'Learned to drum because the band needed a drummer. Now routinely turns up in lists of the best of his generation.',
    extra: [
      'Did not play drums when the band formed. Bought a kit and taught himself, largely by playing along to records at volume.',
      '“Brianstorm”, “Pretty Visitors” and “Don’t Sit Down ’Cause I’ve Moved Your Chair” are the standard demonstrations — but the more interesting move is <em>Tranquility Base</em>, where he plays almost nothing, and it works.',
      'Sings the counter-vocal on “Fluorescent Adolescent” and “D Is for Dangerous”. Has drummed for Iggy Pop.'
    ],
    notable: 'Drums on every release; backing vocals throughout.'
  },
  {
    name: 'Andy Nicholson',
    role: 'Bass (original)',
    status: 'past',
    initials: 'AN',
    born: '1986 — Sheffield',
    years: '2002 — 2006',
    instruments: 'Bass guitar',
    bio: 'The original bassist. Played on the demos and on the fastest-selling debut album in British chart history, then left.',
    extra: [
      'Played every note of <em>Whatever People Say I Am, That’s What I’m Not</em> and the <em>Beneath the Boardwalk</em> demos that made the band’s name before a single was ever released.',
      'Left in May 2006, midway through the first American tour, citing exhaustion. Nick O’Malley finished the dates.',
      'Went on to work in hip-hop production in Sheffield. His playing is the whole low end of the record that started it.'
    ],
    notable: 'Bass on the debut album and the early demos.'
  }
];

/* ------------------------------------------------------------
   Discography — seven studio albums.
   `receipt` fields are what the paper cheque prints in its footer.
   ------------------------------------------------------------ */
const ALBUMS = [
  {
    id: 'whatever',
    title: "Whatever People Say I Am, That's What I'm Not",
    short: 'Whatever People Say I Am',
    year: 2006,
    released: '23 January 2006',
    type: 'Studio album',
    label: 'Domino',
    producers: 'Jim Abbiss, Alan Smyth',
    studio: 'Chapel Studios, Lincolnshire · 2 fly, Sheffield',
    note: 'Recorded fast, sold faster. 363,735 copies in its first week — the fastest-selling debut album in British chart history at the time. Reportage from a Sheffield Friday night: bouncers, taxi ranks, the girl at the bar, the fight outside.',
    tracks: [
      { name: 'The View from the Afternoon', duration: '3:38' },
      { name: 'I Bet You Look Good on the Dancefloor', duration: '2:53' },
      { name: 'Fake Tales of San Francisco', duration: '2:57' },
      { name: 'Dancing Shoes', duration: '2:21' },
      { name: "You Probably Couldn't See for the Lights but You Were Staring Straight at Me", duration: '2:10' },
      { name: 'Still Take You Home', duration: '2:53' },
      { name: 'Riot Van', duration: '2:14' },
      { name: 'Red Light Indicates Doors Are Secured', duration: '2:23' },
      { name: 'Mardy Bum', duration: '2:55' },
      { name: 'Perhaps Vampires Is a Bit Strong But…', duration: '4:56' },
      { name: 'When the Sun Goes Down', duration: '3:20' },
      { name: 'From the Ritz to the Rubble', duration: '3:13' },
      { name: 'A Certain Romance', duration: '5:32' }
    ]
  },
  {
    id: 'fwn',
    title: 'Favourite Worst Nightmare',
    short: 'Favourite Worst Nightmare',
    year: 2007,
    released: '23 April 2007',
    type: 'Studio album',
    label: 'Domino',
    producers: 'James Ford, Mike Crossey',
    studio: 'Miloco, London',
    note: 'Faster, darker, better played. Written and recorded under the weight of the first record and audibly refusing to repeat it. Ends on “505”, which the band still close shows with.',
    tracks: [
      { name: 'Brianstorm', duration: '2:50' },
      { name: 'Teddy Picker', duration: '2:45' },
      { name: 'D Is for Dangerous', duration: '2:13' },
      { name: 'Balaclava', duration: '2:49' },
      { name: 'Fluorescent Adolescent', duration: '2:57' },
      { name: 'Only Ones Who Know', duration: '3:03' },
      { name: 'Do Me a Favour', duration: '3:27' },
      { name: 'This House Is a Circus', duration: '3:09' },
      { name: 'If You Were There, Beware', duration: '4:33' },
      { name: 'The Bad Thing', duration: '2:24' },
      { name: 'Old Yellow Bricks', duration: '3:14' },
      { name: '505', duration: '4:13' }
    ]
  },
  {
    id: 'humbug',
    title: 'Humbug',
    short: 'Humbug',
    year: 2009,
    released: '19 August 2009',
    type: 'Studio album',
    label: 'Domino',
    producers: 'Josh Homme, James Ford',
    studio: 'Rancho De La Luna, Joshua Tree · Mission Sound, Brooklyn',
    note: 'The desert record. Josh Homme took them to Joshua Tree, slowed everything down and turned the guitars into something heavier and stranger. The haircuts changed. So did the band.',
    tracks: [
      { name: 'My Propeller', duration: '3:27' },
      { name: 'Crying Lightning', duration: '3:43' },
      { name: 'Dangerous Animals', duration: '3:31' },
      { name: 'Secret Door', duration: '3:43' },
      { name: 'Potion Approaching', duration: '3:32' },
      { name: 'Fire and the Thud', duration: '3:57' },
      { name: 'Cornerstone', duration: '3:18' },
      { name: 'Dance Little Liar', duration: '4:43' },
      { name: 'Pretty Visitors', duration: '3:40' },
      { name: "The Jeweller's Hands", duration: '5:42' }
    ]
  },
  {
    id: 'sias',
    title: 'Suck It and See',
    short: 'Suck It and See',
    year: 2011,
    released: '6 June 2011',
    type: 'Studio album',
    label: 'Domino',
    producers: 'James Ford',
    studio: 'Sound City, Los Angeles',
    note: 'The pop record hiding inside the desert one. Cleaner melodies, sillier titles, and a title track that is simply a love song. The sleeve — plain white, nothing but the words — got it stickered in some American shops.',
    tracks: [
      { name: "She's Thunderstorms", duration: '3:23' },
      { name: 'Black Treacle', duration: '3:33' },
      { name: 'Brick by Brick', duration: '3:03' },
      { name: 'The Hellcat Spangled Shalalala', duration: '2:58' },
      { name: "Don't Sit Down 'Cause I've Moved Your Chair", duration: '2:50' },
      { name: 'Library Pictures', duration: '2:56' },
      { name: 'All My Own Stunts', duration: '4:00' },
      { name: 'Reckless Serenade', duration: '3:10' },
      { name: 'Piledriver Waltz', duration: '3:13' },
      { name: 'Love Is a Laserquest', duration: '3:57' },
      { name: 'Suck It and See', duration: '3:29' },
      { name: "That's Where You're Wrong", duration: '5:04' }
    ]
  },
  {
    id: 'am',
    title: 'AM',
    short: 'AM',
    year: 2013,
    released: '9 September 2013',
    type: 'Studio album',
    label: 'Domino',
    producers: 'James Ford, Ross Orton',
    studio: 'Sage & Sound, Los Angeles · Rancho De La Luna, Joshua Tree',
    note: 'The one on the receipt. Hip-hop drums, falsetto harmonies, a black-and-white waveform that became a tattoo on half a generation. Closes with a John Cooper Clarke poem set to a drum machine.',
    tracks: [
      { name: 'Do I Wanna Know?', duration: '4:32' },
      { name: 'R U Mine?', duration: '3:21' },
      { name: 'One for the Road', duration: '3:26' },
      { name: 'Arabella', duration: '3:27' },
      { name: 'I Want It All', duration: '3:04' },
      { name: 'No. 1 Party Anthem', duration: '4:03' },
      { name: 'Mad Sounds', duration: '3:35' },
      { name: 'Fireside', duration: '3:01' },
      { name: "Why'd You Only Call Me When You're High?", duration: '2:41' },
      { name: 'Snap Out of It', duration: '3:13' },
      { name: 'Knee Socks', duration: '4:17' },
      { name: 'I Wanna Be Yours', duration: '3:04' }
    ]
  },
  {
    id: 'tbhc',
    title: 'Tranquility Base Hotel & Casino',
    short: 'Tranquility Base',
    year: 2018,
    released: '11 May 2018',
    type: 'Studio album',
    label: 'Domino',
    producers: 'James Ford, Alex Turner',
    studio: "Turner's home studio, Los Angeles · La Frette, France",
    note: 'Written on a Steinway Vertegrand piano and set in a hotel on the Moon. No singles, no guitars up front, no attempt to give anyone what they asked for. It went to number one anyway.',
    tracks: [
      { name: 'Star Treatment', duration: '5:54' },
      { name: 'One Point Perspective', duration: '3:30' },
      { name: 'American Sports', duration: '2:37' },
      { name: 'Tranquility Base Hotel & Casino', duration: '3:11' },
      { name: 'Golden Trunks', duration: '2:53' },
      { name: 'Four Out of Five', duration: '5:12' },
      { name: 'The World’s First Ever Monster Truck Front Flip', duration: '3:36' },
      { name: 'Science Fiction', duration: '3:07' },
      { name: 'She Looks Like Fun', duration: '3:22' },
      { name: 'Batphone', duration: '4:31' },
      { name: 'The Ultracheese', duration: '3:20' }
    ]
  },
  {
    id: 'thecar',
    title: 'The Car',
    short: 'The Car',
    year: 2022,
    released: '21 October 2022',
    type: 'Studio album',
    label: 'Domino',
    producers: 'James Ford',
    studio: 'Butley Priory, Suffolk · La Frette, France · RAK, London',
    note: 'Strings, wah guitar and cinema. The lounge act from the Moon comes back to Earth and finds a soundstage. Turner sings about the machinery of performance while the orchestra swells behind him.',
    tracks: [
      { name: "There'd Better Be a Mirrorball", duration: '4:02' },
      { name: "I Ain't Quite Where I Think I Am", duration: '3:56' },
      { name: 'Sculptures of Anything Goes', duration: '4:12' },
      { name: 'Jet Skis on the Moat', duration: '3:11' },
      { name: 'Body Paint', duration: '4:51' },
      { name: 'The Car', duration: '3:44' },
      { name: 'Big Ideas', duration: '4:02' },
      { name: 'Hello You', duration: '3:30' },
      { name: 'Mr Schwartz', duration: '3:29' },
      { name: 'Perfect Sense', duration: '4:14' }
    ]
  }
];

/* ------------------------------------------------------------
   Singles worth their own card.
   ------------------------------------------------------------ */
const SINGLES = [
  { title: 'I Bet You Look Good on the Dancefloor', year: 2005, note: 'First single on Domino. Straight in at UK number one.' },
  { title: 'When the Sun Goes Down', year: 2006, note: 'Second single, second number one. The Neepsend red-light story.' },
  { title: 'Leave Before the Lights Come On', year: 2006, note: 'Standalone single between the first two albums.' },
  { title: 'Brianstorm', year: 2007, note: 'Announced <em>Favourite Worst Nightmare</em> at full speed.' },
  { title: 'Fluorescent Adolescent', year: 2007, note: 'Co-written with Johanna Bennett. The one everybody knows.' },
  { title: 'Crying Lightning', year: 2009, note: 'First taste of the desert record.' },
  { title: 'Cornerstone', year: 2009, note: 'A love song about mistaking strangers for someone gone.' },
  { title: 'R U Mine?', year: 2012, note: 'Dropped without warning in February 2012. The hinge between two eras.' },
  { title: 'Do I Wanna Know?', year: 2013, note: 'That riff. Over two billion streams and counting.' },
  { title: 'Four Out of Five', year: 2018, note: 'The only real single from the Moon hotel — a taqueria on the roof.' },
  { title: "There'd Better Be a Mirrorball", year: 2022, note: 'Opened <em>The Car</em> with strings and a goodbye.' },
  { title: 'Body Paint', year: 2022, note: 'Ends in the biggest guitar solo the band have put on record in a decade.' }
];

/* ------------------------------------------------------------
   Per-track credits + lore.
   Writers/producers are the released studio credits; the notes
   are context, and anything contested is marked as such.
   ------------------------------------------------------------ */
const TRACK_LORE = {
  'A Certain Romance': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: 'The debut’s closing argument — a five-and-a-half minute defence of the people it has spent twelve tracks mocking. "There’s only music so that there’s new ringtones" is the joke; the last verse is not a joke at all.'
  },
  'Mardy Bum': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: '"Mardy" is Yorkshire for sulking. Written before the band had a record deal and played at the earliest gigs — one of the <em>Beneath the Boardwalk</em> demos that circulated on burned CDs.'
  },
  'I Bet You Look Good on the Dancefloor': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: 'Released 17 October 2005 and straight to UK number one, beating Sugababes and the McFly single, on the strength of a fanbase that had assembled itself online before the band had anything to sell.'
  },
  'When the Sun Goes Down': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: 'Originally titled "Scummy". Set in Neepsend, Sheffield, and sung from the point of view of someone watching a girl get into a car. The second single, and the second number one.'
  },
  'Fake Tales of San Francisco': {
    writers: 'Alex Turner', producers: 'Jim Abbiss, Alan Smyth',
    note: 'A demolition of local bands pretending to be American. "Yeah but his bird likes it, don’t she?" is the whole song in one aside.'
  },
  'Riot Van': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: 'Two minutes and fourteen seconds, brushed drums, no chorus. The quietest thing on the record and the most specific: bored teenagers goading a police van until it stops being funny.'
  },
  'The View from the Afternoon': {
    writers: 'Alex Turner', producers: 'Jim Abbiss',
    note: 'Opens the album with a drum fill rather than a riff — Helders announcing himself before Turner has said a word.'
  },
  'Brianstorm': {
    writers: 'Alex Turner', producers: 'James Ford, Mike Crossey',
    note: 'About a man called Brian the band met on tour in Japan. Two minutes fifty of pure forward motion; the bass never rests.'
  },
  'Fluorescent Adolescent': {
    writers: 'Alex Turner, Johanna Bennett', producers: 'James Ford, Mike Crossey',
    note: 'Co-written with Johanna Bennett, Turner’s girlfriend at the time. A woman in middle age going through the drawer of her twenties. The most-played Arctic Monkeys song at weddings and, probably, at funerals.'
  },
  '505': {
    writers: 'Alex Turner', producers: 'James Ford, Mike Crossey',
    note: 'Builds from an organ drone to a full-band detonation and closes the album. The organ figure is widely noted for its resemblance to Ennio Morricone’s <em>The Good, the Bad and the Ugly</em>. The meaning of "505" has never been confirmed by the band — a hotel room, a flight, an area code, all fan theory. It is the song the live set now ends on.'
  },
  'Do Me a Favour': {
    writers: 'Alex Turner', producers: 'James Ford, Mike Crossey',
    note: 'The break-up song on a record full of them. "Perhaps fuck off might be too kind" — delivered flat, which is why it lands.'
  },
  'Teddy Picker': {
    writers: 'Alex Turner', producers: 'James Ford, Mike Crossey',
    note: 'A teddy picker is the claw machine in an arcade. The song is about fame as a rigged grab for a cheap prize.'
  },
  'Only Ones Who Know': {
    writers: 'Alex Turner', producers: 'James Ford, Mike Crossey',
    note: 'The still point of <em>Favourite Worst Nightmare</em> — reverb, a clean guitar, and no drums until they are needed.'
  },
  'Crying Lightning': {
    writers: 'Alex Turner', producers: 'Josh Homme, James Ford',
    note: 'The first thing anyone heard from <em>Humbug</em>, and a deliberate shock: heavier, slower, sung an octave lower than the band’s audience expected.'
  },
  'Cornerstone': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'A man goes from pub to pub asking women if he can call them by his ex’s name. Recorded almost live, and the warmest thing on a cold record.'
  },
  'Pretty Visitors': {
    writers: 'Alex Turner', producers: 'Josh Homme, James Ford',
    note: 'Organ, hairpin turns and the drumming people cite when they argue for Helders. "What came first, the chicken or the dickhead?"'
  },
  'My Propeller': {
    writers: 'Alex Turner', producers: 'Josh Homme, James Ford',
    note: 'Opens the desert album at a crawl. The innuendo is not subtle and is not meant to be.'
  },
  "She's Thunderstorms": {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'Opens <em>Suck It and See</em> by turning the whole desert palette back toward pop.'
  },
  'Black Treacle': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: '"Now it’s getting dark and the sky looks sticky, more like black treacle than tar" — the line that ended up hand-lettered on a thousand notebooks.'
  },
  "Don't Sit Down 'Cause I've Moved Your Chair": {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'A list of dares set to the heaviest riff on the album. The title is the last item on the list.'
  },
  'Love Is a Laserquest': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'The album’s quiet centre — pretending not to remember someone, at length, unconvincingly.'
  },
  'Suck It and See': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'A straight love song with a title that got the sleeve stickered in parts of America.'
  },
  'Piledriver Waltz': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'First appeared on Turner’s solo soundtrack for <em>Submarine</em>, then re-recorded with the full band.'
  },
  'Do I Wanna Know?': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'The riff arrived before anything else and the song was built to give it room — stomp, handclap, falsetto. It became the band’s most-streamed track by a distance and the entry point for a generation who were not born when the first album came out.'
  },
  'R U Mine?': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'Released with no warning on 27 February 2012, eighteen months before the album. The band have called it the moment they worked out what <em>AM</em> was going to be.'
  },
  'Arabella': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'Interpolates Black Sabbath’s "War Pigs" in the outro riff — a debt the band have never hidden and often lean into live.'
  },
  'I Wanna Be Yours': {
    writers: 'John Cooper Clarke, Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'The words are John Cooper Clarke’s 1982 poem, set to music by Turner and used to close <em>AM</em>. Clarke is credited as a writer. Three decades after publication, the poem became a global streaming hit — and Clarke has said the royalties changed his life.'
  },
  "Why'd You Only Call Me When You're High?": {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'The most obviously hip-hop-shaped thing on <em>AM</em>: a drum loop, a single guitar figure, and a title that answers itself.'
  },
  'No. 1 Party Anthem': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'A ballad in the middle of a party record, doing what the title promises to do and refusing to be an anthem.'
  },
  'Knee Socks': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'Josh Homme sings the high harmony on the outro.'
  },
  'Snap Out of It': {
    writers: 'Alex Turner', producers: 'James Ford, Ross Orton',
    note: 'The most straightforwardly Motown thing the band have recorded.'
  },
  'Star Treatment': {
    writers: 'Alex Turner', producers: 'James Ford, Alex Turner',
    note: 'Opens <em>Tranquility Base</em> with "I just wanted to be one of The Strokes" — an admission, a joke, and a statement of intent about a record that sounds nothing like them.'
  },
  'Four Out of Five': {
    writers: 'Alex Turner', producers: 'James Ford, Alex Turner',
    note: 'The album’s only single. A taqueria opens on the roof of the Moon hotel and gets a good review. It is, underneath the concept, the catchiest thing on the record.'
  },
  'Tranquility Base Hotel & Casino': {
    writers: 'Alex Turner', producers: 'James Ford, Alex Turner',
    note: 'Named for Tranquility Base, the Apollo 11 landing site. The title track is the front desk of the whole conceit.'
  },
  'The Ultracheese': {
    writers: 'Alex Turner', producers: 'James Ford, Alex Turner',
    note: 'Closes the record at the piano. "I’ve still got pictures of friends on the wall" — the sincerest line on an album built out of irony.'
  },
  'One Point Perspective': {
    writers: 'Alex Turner', producers: 'James Ford, Alex Turner',
    note: 'A man loses his thread mid-speech and the band catches him. The lounge piano is the Steinway Vertegrand the album was written on.'
  },
  "There'd Better Be a Mirrorball": {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'Announced <em>The Car</em> with strings, a slow fade and a break-up conducted with total politeness.'
  },
  'Body Paint': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'Builds for four minutes and then hands the last minute to the loudest guitar solo on any Arctic Monkeys record since 2013.'
  },
  'Sculptures of Anything Goes': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'The darkest, most synthetic thing on <em>The Car</em> — a low pulse under a voice that keeps stepping back from the microphone.'
  },
  'Perfect Sense': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'Closes the album, and the current era, with an orchestra and a lyric about the machinery of putting on a show.'
  },
  'Mr Schwartz': {
    writers: 'Alex Turner', producers: 'James Ford',
    note: 'Addressed to someone on a film set. The whole album keeps mistaking life for a production, and this is where it says so out loud.'
  }
};

/* Every track that has no entry above still gets honest credits. */
function creditsFor(trackName, album) {
  const lore = TRACK_LORE[trackName];
  return {
    writers: (lore && lore.writers) || 'Alex Turner',
    producers: (lore && lore.producers) || (album && album.producers) || '—',
    note: (lore && lore.note) || null
  };
}

/* ------------------------------------------------------------
   Timecoded lyric EXCERPTS.
   Short signature lines only, for identification and study —
   full lyrics are not reproduced here. Timings are approximate
   fan transcriptions, used by the follow-along marker in the
   track window. Full words: Genius, linked from every track.
   ------------------------------------------------------------ */
const LYRICS = [
  { track: 'Do I Wanna Know?', album: 'AM', year: 2013, duration: 272, lines: [
    { t: 0.0, text: '[ the riff, alone — four bars before anything else ]' },
    { t: 31.0, text: 'Have you got colour in your cheeks?' },
    { t: 74.0, text: 'Do I wanna know…' },
    { t: 120.0, text: '[ falsetto harmonies enter behind the vocal ]' },
    { t: 196.0, text: 'Crawling back to you' },
    { t: 244.0, text: '[ outro — the riff again, and out ]' }
  ]},
  { track: 'R U Mine?', album: 'AM', year: 2013, duration: 201, lines: [
    { t: 4.0, text: '[ drums first, then everything at once ]' },
    { t: 26.0, text: 'I’m a puppet on a string' },
    { t: 58.0, text: 'She’s a silver lining, lone ranger riding' },
    { t: 71.0, text: 'Are you mine?' },
    { t: 150.0, text: '[ bridge — the tempo doubles under the vocal ]' }
  ]},
  { track: 'I Wanna Be Yours', album: 'AM', year: 2013, duration: 184, lines: [
    { t: 12.0, text: 'I wanna be your vacuum cleaner' },
    { t: 44.0, text: 'Secrets I have held in my heart' },
    { t: 74.0, text: 'You call the shots, babe — I just wanna be yours' },
    { t: 126.0, text: '[ words: John Cooper Clarke, 1982 ]' },
    { t: 160.0, text: 'I wanna be yours' }
  ]},
  { track: '505', album: 'Favourite Worst Nightmare', year: 2007, duration: 253, lines: [
    { t: 0.0, text: '[ organ drone — the Morricone figure ]' },
    { t: 22.0, text: 'I’m going back to 505' },
    { t: 60.0, text: 'Frankly I’d have preferred if you’d have just stayed…' },
    { t: 148.0, text: '[ the band arrives — everything at once ]' },
    { t: 196.0, text: 'But I crumble completely when you cry' },
    { t: 230.0, text: '[ outro ]' }
  ]},
  { track: 'Arabella', album: 'AM', year: 2013, duration: 207, lines: [
    { t: 14.0, text: 'Arabella’s got some interstellar-gator skin boots' },
    { t: 62.0, text: 'My days end best when this sunset gets itself behind…' },
    { t: 128.0, text: '[ the "War Pigs" riff surfaces ]' },
    { t: 178.0, text: '[ outro riff ]' }
  ]},
  { track: 'Fluorescent Adolescent', album: 'Favourite Worst Nightmare', year: 2007, duration: 177, lines: [
    { t: 10.0, text: 'You used to get it in your fishnets' },
    { t: 40.0, text: 'Oh, that boy’s a slag' },
    { t: 62.0, text: 'Where did you go?' },
    { t: 120.0, text: '[ the whole room sings this bit ]' }
  ]},
  { track: 'A Certain Romance', album: "Whatever People Say I Am, That's What I'm Not", year: 2006, duration: 332, lines: [
    { t: 0.0, text: '[ Helders opens alone ]' },
    { t: 48.0, text: 'Well oh they might wear classic Reeboks' },
    { t: 132.0, text: 'There’s only music so that there’s new ringtones' },
    { t: 232.0, text: 'But over there there’s friends of mine' },
    { t: 300.0, text: '[ the tempo drops and the record ends ]' }
  ]},
  { track: 'Mardy Bum', album: "Whatever People Say I Am, That's What I'm Not", year: 2006, duration: 175, lines: [
    { t: 8.0, text: 'Now then Mardy Bum' },
    { t: 40.0, text: 'I’ve seen your frown and it’s like looking down…' },
    { t: 88.0, text: '[ "mardy" — Yorkshire, sulking ]' },
    { t: 140.0, text: 'Oh, remember cuddles in the kitchen' }
  ]},
  { track: 'Cornerstone', album: 'Humbug', year: 2009, duration: 198, lines: [
    { t: 6.0, text: 'I thought I saw you in the Battleship' },
    { t: 48.0, text: 'So I followed her inside' },
    { t: 74.0, text: 'Can I call you her name?' },
    { t: 150.0, text: '[ last verse — her sister ]' }
  ]},
  { track: 'Star Treatment', album: 'Tranquility Base Hotel & Casino', year: 2018, duration: 354, lines: [
    { t: 8.0, text: 'I just wanted to be one of The Strokes' },
    { t: 62.0, text: 'Now look at the mess you made me make' },
    { t: 170.0, text: '[ the lounge band takes an instrumental ]' },
    { t: 300.0, text: '[ closing verse ]' }
  ]},
  { track: 'Four Out of Five', album: 'Tranquility Base Hotel & Casino', year: 2018, duration: 312, lines: [
    { t: 20.0, text: 'Advertise in imaginative ways' },
    { t: 86.0, text: 'Take it easy for a little while' },
    { t: 120.0, text: 'Four stars out of five' },
    { t: 240.0, text: '[ "the Information Action Ratio" ]' }
  ]},
  { track: "There'd Better Be a Mirrorball", album: 'The Car', year: 2022, duration: 242, lines: [
    { t: 0.0, text: '[ strings, and a guitar figure that keeps apologising ]' },
    { t: 34.0, text: 'Don’t get emotional, that ain’t like you' },
    { t: 96.0, text: 'There’d better be a mirrorball' },
    { t: 190.0, text: '[ orchestral outro ]' }
  ]},
  { track: 'Body Paint', album: 'The Car', year: 2022, duration: 291, lines: [
    { t: 18.0, text: 'For a master of deception and subterfuge' },
    { t: 88.0, text: 'You’ve still got a bit of body paint on you' },
    { t: 200.0, text: '[ the solo begins ]' },
    { t: 250.0, text: '[ and does not stop ]' }
  ]},
  { track: 'Black Treacle', album: 'Suck It and See', year: 2011, duration: 213, lines: [
    { t: 16.0, text: 'Now it’s getting dark and the sky looks sticky' },
    { t: 24.0, text: 'More like black treacle than tar' },
    { t: 96.0, text: '[ chorus ]' },
    { t: 176.0, text: '[ outro ]' }
  ]}
];

/* ------------------------------------------------------------
   The lore timeline.
   ------------------------------------------------------------ */
const TIMELINE = [
  { year: '2002', title: 'High Green, Sheffield', text: 'Alex Turner and Jamie Cook are both given guitars for Christmas. Neither can play. They form a band with Andy Nicholson and Matt Helders, who buys a drum kit for the occasion. Early rehearsals happen in a warehouse in Neepsend.' },
  { year: '2003–04', title: 'Beneath the Boardwalk', text: 'The band hand out burned CDs of demos at gigs. Fans rip them, upload them and pass them around online — the collection becomes known as <em>Beneath the Boardwalk</em>, after the venue whose name got attached to the files. The band do not run the accounts spreading them, and later say they had no idea what MySpace was.' },
  { year: '2005', title: 'Domino', text: 'They sign to Domino — an independent — after turning down larger offers, reportedly because label boss Laurence Bell was the only person who talked to them about the records rather than the marketing. "I Bet You Look Good on the Dancefloor" enters the UK chart at number one in October.' },
  { year: '2006', title: 'The fastest-selling debut in British history', text: '<em>Whatever People Say I Am, That’s What I’m Not</em> sells 363,735 copies in its first week, more than the rest of the top twenty combined. It wins the Mercury Prize. Turner wears a "Who the fuck are Arctic Monkeys?" shirt to the Brits, quoting a journalist back at the room. Andy Nicholson leaves mid-tour; Nick O’Malley takes the bass.' },
  { year: '2007', title: 'Favourite Worst Nightmare', text: 'The second album arrives fifteen months after the first and refuses to be a repeat. Every track charts in the UK top 200 on download sales alone. It closes with "505".' },
  { year: '2009', title: 'The desert', text: 'Josh Homme produces most of <em>Humbug</em> at Rancho De La Luna in Joshua Tree. The tempos drop, the guitars thicken, the hair grows. A significant part of the audience does not follow. The band do not turn back.' },
  { year: '2011', title: 'Suck It and See', text: 'Recorded in Los Angeles with James Ford. Cleaner, sweeter, funnier. The plain white sleeve gets stickered in some American shops for the title alone.' },
  { year: '2012', title: 'The Olympics', text: 'The band play the London 2012 opening ceremony to a global audience, including a cover of "Come Together". Six months earlier they had released "R U Mine?" with no warning; nobody yet knows it is a trailer for the biggest record of their career.' },
  { year: '2013', title: 'AM', text: 'Recorded in Los Angeles with James Ford and Ross Orton. Hip-hop drums, falsetto harmonies, leather jackets, and a black-and-white waveform sleeve that becomes one of the most-tattooed images in modern music. It is the band’s fifth consecutive UK number one and their first American top ten.' },
  { year: '2018', title: 'A hotel on the Moon', text: '<em>Tranquility Base Hotel &amp; Casino</em> is written on a Steinway Vertegrand piano at Turner’s house in Los Angeles. No guitars up front, no lead single sent to radio, no concession to expectation. It goes to number one in the UK anyway and splits the audience down the middle.' },
  { year: '2022', title: 'The Car', text: 'Recorded partly at Butley Priory in Suffolk with James Ford, with orchestral arrangements throughout. The lounge act comes back from the Moon and finds itself on a soundstage. Seventh album, seventh UK number one.' },
  { year: 'Now', title: 'Still going', text: 'Twenty-plus years from a Sheffield warehouse to arenas, with the same four people on stage since 2006 and a back catalogue that changes shape every time you return to it.' }
];

/* ------------------------------------------------------------
   Text scraps scattered through the collage.
   Song titles, lyric fragments and band history — the same
   material the fan-art wallpapers are built from.
   ------------------------------------------------------------ */
const SCRAPS = [
  { text: '505', style: 'huge' },
  { text: 'R U MINE?', style: 'ransomish' },
  { text: 'Can I call you her name?', style: 'hand' },
  { text: 'I WANNA BE YOURS', style: 'box' },
  { text: 'CRAWLING BACK TO YOU', style: 'plain' },
  { text: 'YOU CALL THE SHOTS BABE', style: 'box' },
  { text: 'FLUORESCENT ADOLESCENT', style: 'box' },
  { text: 'TEDDY PICKER', style: 'box' },
  { text: 'SUCK IT AND SEE', style: 'plain' },
  { text: 'Who the fuck are Arctic Monkeys?', style: 'hand' },
  { text: 'she’s blowing a kiss at me', style: 'hand' },
  { text: 'DON’T SIT DOWN', style: 'box' },
  { text: 'send a letter to me baby', style: 'hand' },
  { text: 'on a RAINY day', style: 'hand' },
  { text: 'SHALALA SHALALA', style: 'plain' },
  { text: 'Make a wish, concentrate?', style: 'hand' },
  { text: 'MORE LIKE BLACK TREACLE THAN TAR', style: 'box' },
  { text: 'I’M IN A VEST', style: 'plain' },
  { text: 'LASERQUEST', style: 'box' },
  { text: 'She’s Thunderstorms', style: 'hand' },
  { text: 'BRICK BY BRICK', style: 'plain' },
  { text: 'MARDY BUM', style: 'ransomish' },
  { text: 'CALL OFF THE SEARCH', style: 'plain' },
  { text: 'Maybe I’m too busy being yours', style: 'hand' },
  { text: 'TRANQUILITY BASE · HOTEL · CASINO', style: 'plain' },
  { text: 'FRI 14th APRIL', style: 'box' },
  { text: 'METEORS', style: 'plain' },
  { text: 'XOXO', style: 'huge' },
  { text: 'AM', style: 'huge' },
  { text: 'MUSIC', style: 'ransomish' },
  { text: 'PERHAPS VAMPIRES IS A BIT STRONG BUT…', style: 'plain' },
  { text: 'A CERTAIN ROMANCE', style: 'box' }
];

/* ------------------------------------------------------------
   Where to hear each track. Search links rather than hard-coded
   ids: they resolve for every release without going stale.
   ------------------------------------------------------------ */
const ARTIST = 'Arctic Monkeys';

const PLATFORMS = [
  { id: 'spotify', name: 'Spotify',
    url: (t) => `https://open.spotify.com/search/${encodeURIComponent(t + ' ' + ARTIST)}` },
  { id: 'apple', name: 'Apple Music',
    url: (t) => `https://music.apple.com/search?term=${encodeURIComponent(t + ' ' + ARTIST)}` },
  { id: 'ytmusic', name: 'YouTube Music',
    url: (t) => `https://music.youtube.com/search?q=${encodeURIComponent(t + ' ' + ARTIST)}` },
  { id: 'deezer', name: 'Deezer',
    url: (t) => `https://www.deezer.com/search/${encodeURIComponent(t + ' ' + ARTIST)}` },
  { id: 'domino', name: 'Domino',
    url: () => 'https://www.dominomusic.com/artists/arctic-monkeys' }
];

/* Genius deep links. The slug rule matches Genius' own:
   lowercase, ampersand spelled out, apostrophes dropped,
   every other run of non-alphanumerics becomes one hyphen. */
function geniusSlug(title) {
  return String(title)
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function geniusUrl(track) {
  return `https://genius.com/Arctic-monkeys-${geniusSlug(track)}-lyrics`;
}

function geniusSearchUrl(q) {
  return `https://genius.com/search?q=${encodeURIComponent(q + ' ' + ARTIST)}`;
}

function geniusAlbumUrl(albumTitle) {
  return `https://genius.com/albums/Arctic-monkeys/${geniusSlug(albumTitle)}`;
}

function videoUrl(track) {
  return 'https://www.youtube.com/results?search_query='
    + encodeURIComponent(`${ARTIST} ${track} official video`);
}

function lyricsFor(trackName) {
  return LYRICS.find(l => l.track.toLowerCase() === String(trackName).toLowerCase()) || null;
}

function albumOf(trackName) {
  const n = String(trackName).toLowerCase();
  return ALBUMS.find(a => a.tracks.some(t => t.name.toLowerCase() === n)) || null;
}

function secsOf(mmss) {
  const m = /^(\d+):(\d+)$/.exec(String(mmss).trim());
  return m ? (+m[1]) * 60 + (+m[2]) : 0;
}

function albumRuntime(album) {
  const total = album.tracks.reduce((s, t) => s + secsOf(t.duration), 0);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtLrc(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
