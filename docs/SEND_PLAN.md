# SEND PLAN - how to run the two stages in Claude Code

## Before Stage 1 (about 30 minutes, you)
1. Unzip the kit into a fresh folder, `git init`, commit it (the `.gitignore` already keeps audio, references and `.env` out).
2. Your previews are already in the kit (`assets/previews-local/`, gitignored) and all 29 are analysed (`data/beats/`). Optional, 20 minutes: listen to the 5 tracks flagged **check** in `docs/BEATS_REVIEW.md` and fix the BPM (half/double).
3. Create `.env` (gitignored) if a tool needs a key. Check each MCP in Claude Code: `claude mcp list`. Add what is missing with `claude mcp add --transport http <name> <url>`; take the exact URLs/auth from each provider's docs (the Meshy address in your claude.ai connector list looked incomplete: `https://.meshy.ai`).
4. Optional but valuable: photograph or find a **side view** of the guitar for Meshy.
5. Decide whether you will send her the preview soon: it decides how much to polish.

## Stage 1 - Opus 5.5 (foundation)
1. In the repo run `claude`, switch the model to **Opus 5.5** (`/model`), paste **`docs/PROMPT_01.md`** (first prompt).
2. Opus does **M0** and stops with a plan and <= 5 questions. Answer briefly. Say "go".
3. Gates M1 -> M6. At each gate you get a 5-line report. Check on your **real phone** (open the dev server through your LAN IP or a Vercel preview) before saying "next". Typical prompts after M0:
   - `go M1` ... `go M6` (one per message), or `go through M1-M3` if you trust it.
   - Before M5: `go M5` only when you have Meshy credits and are ready to pay for generations.
4. For the lyric test of "The Shallow End" give Opus the **word-timing file** from ElevenLabs (the `words.json` you already have a link to - download it again if the link expired). The transcript stays out of git (the folder is ignored).
5. Stage 1 ends when `HANDOFF.md` exists and the acceptance list in TZ 01 passes. Commit and tag `stage-1`.

## Handoff
- Commit everything. Start a **new** Claude Code session (clean context), switch to **Sonnet 5.5**.
- First message: `Read README.md, docs/CONTRACT.md, HANDOFF.md, docs/TZ_02_SONNET_content.md and start with S1. Summarise the rules in 10 lines first.`
- Keep the same repo. Stage 2 must not touch `core/` and `vendor/`.

## Stage 2 - Sonnet 5.5 (content and polish)
- `next` after each S1 -> S8 report; test on the phone after S2, S3, S5.
- If Sonnet writes `REQUESTS_FOR_CORE.md` entries, open an Opus session for them (small, one at a time).
- Final: run the public-readiness section of the report.

## Final review (any model, 1 hour)
Lighthouse + real-device pass, accessibility pass, `ASSET_REGISTER.md` read-through, `build:public` inspection. Commit and tag `preview-1`.

## Pitch (you)
1. Deploy the **private** build to Vercel with an unguessable URL; noindex is already in the headers.
2. Email the **public contact address from her website** (verify it first). Short: a compliment about a specific song, 1-2 screenshots + the link, and a clear ask: (a) is she fine with a preview using her public music/photos, (b) could she send the lyrics from her booklet and permission to show them, (c) would she like to collaborate or take it over. Offer: free for credit / paid support / own domain and edits.
3. If she says yes: replace gated assets with her press kit, flip flags in `config/rights.json`, build with `PUBLIC_BUILD=1`, remove noindex only then. If no answer or no: take the site down and delete her photos and cover art.
