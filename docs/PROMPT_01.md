# PROMPT 01 - paste this as the first message to Opus 5.5 in Claude Code

```
You are the architect of a private-preview website for the singer-songwriter sunniva. Work inside this repo (the "kit"). Talk to me in Russian, briefly. Write code, comments and docs in English.

STEP 1 - Read, in this order:
README.md, docs/CONTRACT.md, docs/DATA_SCHEMA.md, docs/ASSET_REGISTER.md,
vendor/lyrics-engine/AI_GUIDE.md and vendor/lyrics-engine/README.md,
reference/arctic-monkeys-archive/README.md (patterns only, never content),
extract/receipt/README_RECEIPT.md (the receipt mechanism, already adapted - you will not build it, but must not block it),
docs/BEATS_REVIEW.md,
and finally docs/TZ_01_OPUS_foundation.md.

STEP 2 - Do ONLY milestone M0 of TZ_01 (audit and plan). No feature code, no installs, no paid MCP calls (Meshy / ElevenLabs / TinyFish) yet.
1. Verify the kit: required files exist, every JSON parses, receipts have 17 / 7 / 8 / 1 rows, tracks.json has 33 rows and 29 unique songs. Report problems; do not fix them silently.
2. Read the lyrics-engine docs and answer precisely: is there a custom `sources` hook? per-line events/callbacks? a renderer or theme hook? what is its time base? Propose the adapter design WITHOUT editing vendor/.
3. Skim the reference modules (trackmodal, quiz, receipt, player, collage/ransom, crumple tool) and say what to reuse as a pattern vs rewrite, and why.
4. Propose the repo layout and a milestone list M1-M6 with concrete, testable acceptance checks (budgets from CONTRACT section 4). Flag the top risks and your mitigation.
5. Restate the hard constraints in your own words (max 12 lines) so I can confirm you understood them.
6. Ask at most 5 blocking questions - only things you cannot decide yourself.

Then STOP and wait for my message "go M1". Keep the whole answer under ~80 lines.
```

## Follow-up prompts (one per message)
- `go M1` ... `go M6` - each stops at its gate with a 5-line report.
- For M4 lyric test: `Here is the word-timing file for The Shallow End (private preview): <path>. Build data/lyrics/6808001979.json with permission "private-preview" and do not commit it.`
- Before M5: `go M5. I have Meshy credits. Tell me the cost first.`
- If something breaks: `Reproduce, fix at the root, add a test, report numbers.`
