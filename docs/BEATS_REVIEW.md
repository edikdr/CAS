# BEATS REVIEW

Automatic tempo/onset analysis of the 29 album/demo/single previews (`tools/analyze_beats.py`). **Nothing here is verified.** Listen to each 30s preview and tap along; write the confirmed BPM into the JSON and set `status` to `verified`.

Tempo has an octave ambiguity (half/double). Rows marked **check** sit at the edge of the search range, so the real tempo is probably double or half of the value shown.

| # | Release | Track | BPM | Alternatives | First beat (s) | |
|---|---|---|---|---|---|---|
| 1 | Fantasy Prologue | The Shallow End | 99.4 | 198.8, 67.1 | 0.383 |  |
| 2 | Fantasy Prologue | Can't Focus These Days | 86.1 | 82.0, 172.3 | 0.511 |  |
| 3 | Fantasy Prologue | Surface Tension | 152.0 | 74.9, 156.6 | 0.372 |  |
| 4 | Fantasy Prologue | Combat | 63.0 | 97.5, 184.6 | 0.929 | **check** |
| 5 | Fantasy Prologue | 20 | 156.6 | 161.5, 166.7 | 0.372 |  |
| 6 | Fantasy Prologue | It's Obvious | 73.8 | 112.3, 107.7 | 0.081 |  |
| 7 | Fantasy Prologue | You Don't Know Me Anymore | 79.5 | 161.5, 156.6 | 0.209 |  |
| 8 | Fantasy Prologue | Guardrails | 95.7 | 143.6, 152.0 | 0.023 |  |
| 9 | Fantasy Prologue | Sleepless Interlude | 90.7 | 86.1, 95.7 | 0.36 |  |
| 10 | Fantasy Prologue | Exit | 92.3 | 87.6, 97.5 | 0.383 |  |
| 11 | Fantasy Prologue | Prom Queen | 114.8 | 57.4, 120.2 | 0.372 |  |
| 12 | Fantasy Prologue | It Does the Trick | 99.4 | 66.3, 94.0 | 0.313 |  |
| 13 | Fantasy Prologue | Odd Years | 136.0 | 143.6, 129.2 | 0.418 |  |
| 14 | Fantasy Prologue | Decasia | 161.5 | 80.7, 156.6 | 0.313 |  |
| 15 | Fantasy Prologue | Do You Dream About It Too? | 92.3 | 97.5, 87.6 | 0.0 |  |
| 16 | Fantasy Prologue | Thanks for the Dance | 90.7 | 184.6, 178.2 | 0.197 |  |
| 17 | Fantasy Prologue | This Time I Promise | 95.7 | 103.4, 112.3 | 0.604 |  |
| 18 | Durocher Demos | You Look Nice (feat. link3) | 166.7 | 172.3, 114.8 | 0.174 | **check** |
| 19 | Durocher Demos | A Letter to My Mother's Daughter | 178.2 | 95.7, 184.6 | 0.093 | **check** |
| 20 | Durocher Demos | How to Hold the Rain | 143.6 | 112.3, 117.5 | 0.36 |  |
| 21 | Durocher Demos | Half Words (feat. parallel) | 103.4 | 68.0, 63.0 | 0.174 |  |
| 22 | Durocher Demos | Laundromat (feat. link3) | 64.6 | 97.5, 191.4 | 0.789 | **check** |
| 23 | Durocher Demos | I Don't Believe in Anything but You | 67.1 | 136.0, 129.2 | 0.093 |  |
| 24 | Durocher Demos | Morning Lullaby | 103.4 | 67.1, 107.7 | 0.07 |  |
| 25 | Durocher Demos | Silent in a Dream (feat. Total) | 120.2 | 126.0, 114.8 | 0.046 |  |
| 26 | Im coming down | Im coming down | 74.9 | 152.0, 147.7 | 0.348 |  |
| 27 | Like a kid | Like a kid | 143.6 | 147.7, 73.8 | 0.081 |  |
| 28 | closest i could get | closest i could get | 63.0 | 126.0, 117.5 | 0.348 | **check** |
| 29 | Around The Smoke (feat. sunniva) | Around The Smoke (feat. sunniva) | 139.7 | 94.0, 69.8 | 0.07 |  |

Not analysed: the four single rows (Surface Tension, Prom Queen, Exit, It's Obvious) that duplicate album songs. Their Apple preview file is a different URL, so the clip may start at a different point - analyse those previews separately if the single rows are used for playback.
