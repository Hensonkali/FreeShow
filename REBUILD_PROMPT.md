# REBUILD_PROMPT.md — paste this to an AI coding agent to rebuild everything from scratch

> Copy everything below the line into a fresh agent session (Claude Code, Cursor, OpenCode…)
> on the machine where you cloned your fork. It contains everything the agent must know,
> including every trap we already solved the hard way.

---

You are building "FreeShow AI" — a fork of ChurchApps/FreeShow (Electron 37, Svelte 3,
TypeScript, Vite) with PewBeam-style live scripture tracking for church use. The end user is a
preacher; the goal is a hands-free media team: the app listens to the microphone, and within
~3 seconds of the preacher quoting or referencing a verse it projects it. It must be LIGHT —
smooth on a 4–8 GB RAM laptop with 128 MB integrated graphics. English must be excellent;
isiZulu/isiXhosa at 60–70% accuracy is acceptable. Nothing may break normal FreeShow features,
and no licensed Bible text may ever be bundled.

RULES: Do one step at a time. Commit after each step on branch `my-freeshow`. Run the unit
tests and gates after every change and show the results (`npm run test:unit`, `npx svelte-check`,
`npx tsc --p config/typescript/tsconfig.electron.json --noEmit`, prettier with
`config/formatting/.prettierrc.yaml`). Ask before adding any big dependency. Explain changes in
plain English. Master FreeShow's architecture first (read AGENTS.md / ARCHITECTURE.md if present).

ENVIRONMENT TRAPS (solved — follow exactly):
1. This npm blocks git deps (`EALLOWGIT`) → install with `npm install --allow-git all --ignore-scripts`.
   Network is slow (~10 KB/s): retry on ECONNRESET; downloads must always be resumable.
2. No Visual Studio C++ on the machine. Native modules come from PREBUILTS only:
   - `node node_modules/electron/install.js` (downloads the Electron binary)
   - opus: in `node_modules/@discordjs/opus` run `npx node-pre-gyp install --target=22.12.0`
     (NAPI v3 prebuild; scripts/postBuild.js renames the folder for Electron)
   - sqlite: in `node_modules/better-sqlite3` run
     `node ../../node_modules/prebuild-install/bin.js -r electron -t 37.10.3`
3. When packaging: `npx electron-builder --config config/building/electron-builder.yaml
   --config.npmRebuild=false --win nsis --publish never` and first strip the
   `win.azureSignOptions` block from the yaml (no signing cert) and ensure `public/index.html`
   is the PRODUCTION script variant (postBuild does this; `git checkout -- public/index.html
   ... yaml` afterwards to clean the tree). Install silently with `installer.exe /S`.

THE 12 STEPS:
1. Save AGENTS.md with the rules. Verify the app runs.
2. Study the Smart/AI code under `src/electron/ai`, `src/frontend/ai`; write MY_NOTES.md
   (mic → 16 kHz AudioWorklet → IPC → Nemotron/sherpa-onnx worker → transcript →
   detectors → suggestion/auto-display).
3. Fix the model download UI: `LocalModelManager.getStatus` pairs ready:false with an error
   string, so `NemotronOptions.svelte`'s error branch hid the Download button. Show explicit
   states missing/downloading/ready/error with a progress bar, cancel, retry, delete; keep
   `.part`-file resume across restarts and per-file sha256.
4. `models.ts` + `models.json` manifest (id, engine, label, source, revision, license,
   licenseUrl, totalBytes, per-file URL/sha256/bytes) with a drift test; auto-download missing
   OPEN-LICENSED models at startup (`ensureRequiredModels`), resumable, offline afterwards.
   Models: Nemotron STT (OpenMDW-1.1, ~651 MB, HF csukuangfj2 pinned revision) and MiniLM
   embeddings (Apache-2.0, ~23 MB, `Xenova/all-MiniLM-L6-v2` — file is at `onnx/model_quantized.onnx`).
5. Detection test popup: type a sentence, see which detector fired (add `detector` to
   MatchResult), the verse and confidence. Add `MatchResult.detector` attribution everywhere.
6. Paraphrase search: main-process `EmbeddingEngine` (src/electron/ai/embed/) — hand-written
   WordPiece tokenizer + mean-pool + L2-norm, `onnxruntime-node` CPU with 2 intra-op threads,
   per-Bible vector cache on disk (`bin/embeddings/vectors/*.f32` + json sidecar), new
   `AI_EMBED_*` IPC channels. Renderer asks for top-3; require score ≥ 0.60 and a ≥ 0.05 gap;
   scores ≥ 0.75 flow through the normal auto-present gates, lower scores are suggestion-only.
   A "Paraphrase search" toggle disables it on tiny machines.
7. Safety: top-bar Pause Listening button, Ctrl+K clears output + suggestions, 5-minute
   cooldown on auto-displaying the same verse twice, and a decision log: every detection
   appends one JSON line to `<userData>/logs/ai-decisions-YYYY-MM-DD.log` via a new `AI_LOG`
   IPC channel (heard text, detector, verse, confidence, action, reason; dedupe identical
   entries; always log user overrides).
8. Voice commands execute INSTANTLY (not suggestions): "next verse"/"previous verse"
   advance within the displayed passage (verse-count checked via the Bible cache index);
   translation commands search ALL installed Bibles (offline AND online): phrasings
   "give me / switch to / change to / move it to / show me / show this in / have that in /
   put the NLT on / read from / open / use". Name matching: exact, then whole-word
   (KJV inside "KJV (King James Version)"), then fuzzy word similarity ≥ 0.75 (mishears).
   If the translation is a KNOWN name but not installed (NLT/ESV/NIV/KJV/NKJV/NASB/NCV/CEV/
   AMP/MSG/CSB/WEB/ASV/BSB/YLT/DBY/GNB/TLV/ISV…), show "X is not installed" on screen — never
   a wrong verse. After switching, re-project the current passage in the new translation.
   Dedup chunk-overlap echoes only (key navigation on transcript length) so repeated
   "next verse" advances every time.
9. isiZulu references: add Zulu chapter/verse words (isahluko/ivesi + mishearing variants),
   Zulu numbers 1–100 incl. glued compounds (ishumi nesithupha=16, amashumi amabili
   nanye=21), se-/ye- ordinals, range words (kuze); build book aliases from the IMPORTED
   Bible's own book names and strip noun-class prefixes (uJohane/kwaJohane → Johane).
   Works for mixed speech like "Johane 3 ivesi 16". Tests for a Zulu speaker to verify.
10. isiZulu text matching: when the Bible's name contains "zulu", index it with 4-character
    char-grams instead of words (same TF-IDF pipeline, bigger window sizes) so paraphrases
    survive agglutinative word-shape changes.
11. Swivuriso (optional SA-languages STT): research and write SWIVURISO_RESEARCH.md — the
    MIT models are `dsfsi-anv/za-anv-multilingual-whisper-v3-turbo` (3.24 GB safetensors
    only) and there are NO official prebuilt whisper.cpp Windows binaries, so the engine
    takes a one-time external prep (build whisper-cli + convert/quantize the fine-tune,
    e.g. on a free Colab) and then drops `whisper-cli.exe` + `model-ggml.bin` into
    `<userData>/bin/swivuriso/`. Build it as a second engine: 6-second WAV chunks, spawn
    whisper-cli per chunk, drop backlog instead of queueing, engine dropdown next to
    Nemotron, resumable raw-model download via the manifest (autoDownload:false).
12. Shadow mode toggle (detect + log, never display) for rehearsing on recorded sermons.
    Then: production build → NSIS installer → install over the existing app (/S) → verify
    launch → push the branch to GitHub and attach the installer to a Release.

ACCEPTANCE: `npm run test:unit` green (upstream cloud-sync failures pre-existing), tsc +
svelte-check clean on touched files, ~90 AI tests, installer runs, app projects scripture
from spoken references/quotes/paraphrases, "next verse" repeats forever, "move it to
Amplified" switches (fuzzy), "show this in Zulu" re-projects, missing translations say so.
