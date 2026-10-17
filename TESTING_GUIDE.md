# TESTING_GUIDE.md — your build, feature by feature

Every step below is already coded, committed on `my-freeshow`, and included in the installer you
received. Work top to bottom; nothing here can lose your existing FreeShow data (shows, Bibles,
settings live in `Documents\FreeShow` and are untouched by the upgrade).

## 1. Turn it on
Settings → **Smart** → enable. First time: the **speech model (~651 MB)** downloads automatically
in the background and resumes across restarts — with a 10 KB/s line let it run overnight
(progress is in Smart settings; a partial download is never lost). Enable **only after** it says
ready, then pick your microphone. Everything then works fully offline.

## 2. The ≤3-second flow (PewBeam-style)
Just preach. When a verse is quoted or referenced:
- **Reference spoken** ("John chapter three verse sixteen") → displayed/suggested at 98% confidence.
- **Verse quoted without the reference** → TF-IDF content match (≥70% confidence) → suggested.
- **Paraphrase** ("God loved the world so much he gave his son") → the local embedding model
  finds the verse and **suggests it — never auto-displays** (0.60 score floor + clear gap to 2nd place).
- Auto-display is **off by default**. When you trust it: Smart → Auto present → *If high confidence*
  (or higher). Safety stays: 50% floor, 30 s cooldown after any manual click, same verse never
  auto-shown twice within 5 minutes.

## 3. Voice commands (execute instantly)
- **"next verse" / "previous verse"** — advances the passage on screen.
- **"give me NLT" / "switch to ESV" / "put the KJV on"** — switches translation if installed,
  or says on screen "**NLT is not installed**" instead of showing a wrong verse.

## 4. Pause & Clear (panic buttons)
- Red **microphone button in the top bar** = Pause/Resume AI listening.
- **Ctrl+K** = clear the output and drop pending suggestions.

## 5. Shadow mode (rehearse first — recommended)
Smart → **Shadow mode** on: detection runs, suggestions appear, decisions are logged, but
**nothing is ever displayed**. Play a recorded sermon through your mic and watch the AI panel.

## 6. The audit trail
Every decision appends to `%APPDATA%\FreeShow\logs\ai-decisions-YYYY-MM-DD.jsonl`:
what was heard, which detector fired, the verse, confidence, whether it was shown, and every
override/dismissal of yours. Review it after each rehearsal.

## 7. Test box (no microphone needed)
Settings → Smart → **Test detection**: type a sentence, see detector, verse and confidence.
Great for checking the Zulu parser with a Zulu speaker (see tests in
`src/frontend/ai/scripture/references.test.ts`).

## 8. Zulu
- References: "Johane 3 ivesi 16", "uJohane isahluko sesithathu ivesi 16",
  "Izihlabelelo 23 ivesi amashumi amabili nesithupha" (Ps 23:26) all parse; noun-class prefixes
  (uJohane/kwaJohane) are stripped; book names come from YOUR imported Zulu Bible.
- Text matching: a Zulu Bible (named with "Zulu" in it) is indexed by 4-character n-grams, so
  heavy word-shape changes still match.
- Hearing it: see **SWIVURISO_RESEARCH.md** — the optional Swivuriso engine (isiZulu
  recognition, MIT) needs a one-time build of whisper-cli + converted model on any other PC
  (free Colab works); the in-app download of the 3.24 GB model is resumable. Until then the
  Nemotron engine handles ~40 languages (English etc.).

## 9. What else to know
- The installer **upgrades** your existing FreeShow (same app, same data).
- Auto-update: this build is version 1.6.7-beta.1, same as upstream — if upstream publishes a
  newer release the app may offer to update; **decline** until you want to return to stock.
- Decision log + suggestions survive restarts (log file persists; suggestions are per-session).
