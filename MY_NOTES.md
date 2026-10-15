# MY_NOTES.md — How the AI / "Smart" feature works

*Step 2 of the plan. Study notes only — no code was changed. Written in plain English.*

FreeShow's **Smart** feature listens to the microphone during a sermon, turns the speech into
text, tries to recognise which Bible verse is being quoted, and then either **suggests** that
verse to the operator (a clickable pill) or — if the operator has allowed it and confidence is
very high — **displays it automatically**. Nothing is uploaded: audio is processed on this
computer (except the optional chat/LLM branch, which is off by default).

---

## Part 1 — How audio becomes text

**In one sentence:** the microphone is read in the browser page, chopped into 100 ms chunks of
16 kHz mono sound, sent to the Electron main process, and decoded into words by a small
Nemotron speech model running in a separate worker process via `sherpa-onnx-node`.

Step by step:

1. **Turning it on.** The floating AI widget (`AiFloating.svelte`) reacts to the `ai.enabled`
   setting plus a chosen microphone and calls `SpeechToText.enable()`.
2. **Capturing sound** (`src/frontend/ai/stt/stt.ts`):
   - `getUserMedia` opens the mic (mono, echo cancellation *off* so words stay crisp).
   - An `AudioContext` fixed to **16 000 Hz** sample rate.
   - An AudioWorklet (`public/assets/stt-processor.js`) collects samples and emits
     **Int16** packets of **1 600 samples = 100 ms** each.
   - Each packet is sent over IPC on channel `Main.AI_AUDIO_DATA`.
3. **Main process** (`src/electron/ai/stt/SpeechToTextManager.ts`): receives the audio
   (`pushAudio`) and forwards it to the running transcriber. Starting the engine
   (`Main.AI_LISTEN_START`) first checks the model files exist (`LocalModelManager.getStatus`).
4. **Transcription** (`src/electron/ai/stt/models/NemotronTranscriber.ts` →
   `nemotronWorker.ts`): a `utilityProcess` worker loads **sherpa-onnx** with the Nemotron
   int8 streaming model plus the Silero voice-activity detector (VAD). The VAD decides when
   someone is speaking; the recogniser streams out words. When the speaker pauses
   (~0.8 s of silence) the utterance is "committed" and sent back as a **segment** (finished
   sentence) or **interim** (still being spoken) message.
   - A watchdog restarts the worker if it goes silent for 60 s; if the worker can't be
     forked, an in-process fallback driver is used.
5. **Back to the renderer** (`ToMain.AI_TRANSCRIPT` → `src/frontend/IPC/responsesMain.ts`
   → `src/frontend/ai/stt/transcript.ts`):
   - Interim text is shown live (`sttTranscript.unprocessed`), final text is appended to
     `sttTranscript.finalized`.
   - Text is **chunked** for analysis: the last ~**120 words** plus an 8-word overlap, so the
     detector always sees the current sentence *and* a little context. Each chunk carries an
     average **confidence** (from the model's token probabilities).
   - `sttHelper.ts` (main process, shared) contains the plumbing helpers: loop breaking for
     the recogniser's repetition bug, seam de-duplication, confidence maths, and a "music"
     label detector (music annotations are never fed to detection).

---

## Part 2 — How text becomes a detected verse

**In one sentence:** every chunk is normalised (fix speech errors, numbers, spoken-form
references), then run through three rule-based detectors against a pre-built index of the
**local** Bible — and only if all of them fail does the optional LLM get a turn.

Entry point: `AiManager.processSTTChunk()` (`src/frontend/ai/manager/AiManager.ts`).

1. **Preload** — `BibleCacheManager` builds a search index for each *local* (non-API) Bible:
   verse list, book/chapter reference index, word vocabulary, an **IDF** (rarity) table and an
   inverted word→verses index. Built in the background with a time-sliced loop so the UI
   never freezes. *(API Bibles are refused with a toast — detection needs the local text.)*
2. **Normalisation** (three small pass-steps, run in two variants: raw and speech-corrected):
   - `mishearings.ts` — fixes common speech-to-text mistakes ("palm" → "psalm", "matt" → "matthew").
   - `numbers.ts` + `numberDictionary.ts` — turns spoken numbers into digits in 8 languages
     ("sixteen" → 16, "vingt-trois" → 23, "verse one through six" → 1-6).
   - `references.ts` + `referenceDictionary.ts` — rewrites spoken references into `Book C:V`
     form: ordinals ("First John" → "1 John"), inversions ("verse 16 of John chapter 3"),
     glued digits ("John 316" → "John 3:16"), single-chapter books, joiners, dots.
3. **Detector 1 — explicit reference** (`findReferenceMatch`): a regex built from the Bible's
   real book names. Confidence **98** for "John 3:16", **75** for chapter-only ("John 3").
4. **Detector 2 — standalone / next verse** (`findStandaloneVerseMatch`,
   `findNextVerseCue`): "verse 16" or "next verse" resolved against the current reference or
   the verse currently on screen. Confidence **80–85**.
5. **Detector 3 — content / quote match** (`findContentMatch`): sliding windows (20/60/80/120
   words) compared against every verse using TF-IDF term overlap with distance decay,
   coverage bonus, and a "proximity prior" (the verse on screen ×1.25, the *next* verse
   ×1.15, unrelated chapters ×0.5…). Confidence is clamped to 51–98 and the result is
   **thrown away below 70**. This is what catches *paraphrases* — the speaker not saying the
   verse number, just the words.
6. **Arbitration:** an explicit reference (≥75) wins, unless a content match reaches ≥80.
   A "fresh" context match must beat the active-context match by >5 to switch immediately.
7. **Cross-translation check:** the same content match is run against all other local Bibles;
   a *better* match elsewhere is emitted with `scriptureIsNewTranslation: true` — and that
   kind is **always suggest-only, never auto-displayed**.
8. **Version detector** (`BibleVersionDetector.ts`): recognises spoken translation *names*
   ("give me NLT") with fuzzy matching → a `scripture_version` match (confidence 85–95).
9. **LLM branch (optional, off by default):** only if no rule detector matched, ≥5 s passed
   since the last match, and an LLM provider is configured. `llmManager.detectMatch` sends the
   chunk with a strict JSON prompt (`prompts.ts`) and gets back
   `{type, content, confidence}`. Providers: Ollama (local), OpenAI, Anthropic, Google.

---

## Part 3 — From a match to a suggestion or an auto-display

`AiManager.newMatch()` is the decision point, and `shouldAutoPlay()` holds **all the safety
gates**. A match only auto-displays when *every* one of these is true:

1. It is a `scripture` match (never a translation-name match, never a new-translation match).
2. Confidence **> 50** absolute floor.
3. The operator's setting allows it — `ai.scripture.confidence`:
   **`ask` (the default) means "never auto-display, only suggest"**, `highest` >95, `high` >75, `medium` >50.
4. The output was **not manually changed in the last 30 seconds** (the operator just clicked
   something → we stay out of their way).
5. It hasn't already been suggested at a similar confidence (de-dup, including
   "this reference is inside one already suggested").

**If all gates pass** → the scripture is presented immediately (`startScripture(...)` shows it
on the output) and a suggestion marked `presented` appears for 4 seconds as a record.

**If any gate fails** → a suggestion is added:
- a floating **pill** (`SmartAction.svelte`) for **30 s**: "▶ Click to present" / "📖 Open";
- and a row in the transcription panel (`AiTranscription.svelte`) that lives for **5 minutes**
  (max 15 suggestions) with a confidence meter — clicking presents it, "open" loads the
  passage without showing it.
- Translation matches become an "open that translation" action instead.

So: **the default posture is suggest-only. Auto-display must be deliberately switched on** in
Settings → Smart → Auto Scripture, and even then it obeys the 30 s cooldown and confidence bar.

Other existing controls: master `ai.enabled` toggle, `sttTempDisabled` (temporary listen
pause from the widget), the external `toggle_stt_listening` API function, worker stall
watchdog, stale-search cancellation (`latestSearchId`), suggestion TTL/limit.

**What does *not* exist yet** (relevant for later steps): no persistent decision log, no
shadow mode, no cooldown per *verse* (only the 30 s manual-output cooldown), no Pause
Listening button on the main screen, no voice commands.

---

## Part 4 — Where the model lives and why the Download button is missing

- Model files are downloaded to **`<userData>/bin/nemotron/models/`** and consist of
  `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt` (a pinned
  HuggingFace revision of sherpa-onnx's Nemotron 3.5 streaming export, ~682 MB) plus
  `silero_vad.onnx` (from the sherpa-onnx GitHub releases).
- `src/electron/ai/setup/models/nemotron.ts` downloads them one by one with SHA-256
  checksums, writes a `model.json` integrity stamp, and reports progress on
  `ToMain.MEDIA_DOWNLOAD_PROGRESS` under the key `"nemotron"`.
- `DownloadManager.ts` does the actual HTTP work: `.part` file + `Range` header resume,
  3 attempts, sha256 computation.
- `LocalModelManager.getStatus("nemotron")` returns
  `{ ready:false, error:"The local model is missing" }` when the files aren't there.

**Why the Smart settings show only "local model is missing" with no Download button —
the bug for Step 3 (found, not yet fixed):**

`NemotronOptions.svelte` renders:

```
{#if !status}          → spinner
{:else if status.error}→ ⚠️ warning text        ← "missing"/"outdated" lands HERE
{:else if !status.ready} → Download button      ← dead code for every real case
```

`getStatus()` **always attaches an `error` string when `ready:false`** (`LocalModelManager.ts:65`),
so the error branch wins and the download branch is unreachable. Same pattern in
`STTOptions.svelte` (`{:else}` → warning Tip only). Additionally the Cancel/Delete buttons are
**commented out** in `NemotronOptions.svelte`, there is no `downloading` state in
`EngineStatus`, and a failed `listen()` never sets `aiSttStatus.message` (the widget shows a
generic "Something went wrong").

---

## Part 5 — Every file and its job (50 files)

### `src/types/ai/` (2)
| File | Job |
|---|---|
| `Ai.ts` | Shared types: `MatchResult`, `AiSuggestion`, `EngineStatus`, `AiSetupOptions`, `AIProviderId` |
| `AiSettings.ts` | The `ai` settings shape: `enabled`, `stt {micDeviceId, engine, engineOptions}`, `llm {provider, model}`, `scripture.confidence` |

### `src/electron/ai/` — main process (16)
| File | Job |
|---|---|
| `stt/SpeechToTextManager.ts` | Engine orchestrator: start/stop/push audio, emits `AI_STATUS` + `AI_TRANSCRIPT` |
| `stt/sttHelper.ts` | Pure helpers: segment types, loop breaking, seam dedup, confidence maths, music labels |
| `stt/sttHelper.test.ts` | Unit tests for the helpers above |
| `stt/models/NemotronTranscriber.ts` | Forks/monitors the worker process, stall watchdog, in-process fallback |
| `stt/models/nemotronWorker.ts` | The worker: sherpa-onnx recogniser + VAD, streams segments/interims |
| `setup/LocalModelManager.ts` | Model paths, `getStatus`, download/cancel/delete dispatch, bin folder listing |
| `setup/DownloadManager.ts` | Generic downloader: `.part` + Range resume, 3 retries, sha256, progress |
| `setup/status.ts` | `aiGetModelStatus` — aggregates nemotron + LLM provider readiness |
| `setup/models/nemotron.ts` | Nemotron file list (URL + sha256), download engine, integrity check, stamp |
| `setup/aiKeys.ts` | LLM API keys in the `ACCESS` store |
| `llm/llmProviders.ts` | Provider registry + `completeLLM()` + model list fetching |
| `llm/providers/APIProvider.ts` | Base class: timeouts, message building, error normalising |
| `llm/providers/ollama.ts` | Local Ollama (127.0.0.1:11434) |
| `llm/providers/openai.ts` | OpenAI (strict JSON output) |
| `llm/providers/anthropic.ts` | Anthropic |
| `llm/providers/google.ts` | Google Gemini |

### `src/frontend/ai/` — renderer (32)
| File | Job |
|---|---|
| `stt/stt.ts` | Mic capture → 16 kHz worklet → `AI_AUDIO_DATA`; enable/restart logic |
| `stt/transcript.ts` | Accumulates live text, debounces, cuts 120-word chunks → `AiManager` |
| `manager/AiManager.ts` | **The brain:** detection chain + all safety gates + suggestion/auto-play |
| `manager/ChatAction.ts` | Executes LLM chat actions (apply/create slide, template, overlay) |
| `llm/llmManager.ts` | LLM detect + chat sessions, IPC to `AI_LLM_COMPLETE` |
| `llm/llmSession.ts` | Resolves/validates LLM config, syncs `aiLlmStatus` |
| `llm/prompts.ts` | All prompts and JSON schemas (detection controller, chat) |
| `scripture/BibleCacheManager.ts` | Builds/holds the per-Bible search index (IDF, inverted index) |
| `scripture/BibleSearchDetector.ts` | **The detector:** reference / standalone-verse / content match + scoring |
| `scripture/BibleVersionDetector.ts` | Detects spoken translation names → switch suggestion |
| `scripture/references.ts` | Spoken-reference rewrites (`normalizeReferences`) + range containment check |
| `scripture/references.test.ts` | Tests for the rewrites (multi-language) |
| `scripture/numbers.ts` | Spoken numbers → digits (8 languages) |
| `scripture/numbers.test.ts` | Tests for number normalisation |
| `scripture/numberDictionary.ts` | Raw word→number tables (units, tens, ordinals, compounds) |
| `scripture/mishearings.ts` | Common ASR mishearings table + fixer |
| `scripture/referenceDictionary.ts` | Multilingual chapter/verse/joiner keywords, book-name normaliser |
| `components/settings/SmartSettings.svelte` | The "Smart" settings tab (enable toggle, options) |
| `components/settings/STTOptions.svelte` | Mic dropdown **or** warning when model not ready |
| `components/settings/AutoScriptureOptions.svelte` | Auto-present confidence dropdown (ask/highest/high/medium) |
| `components/popups/AiModelManager.svelte` | Model-manager popup shell (setup/transcription/LLM modes) |
| `components/popups/NemotronOptions.svelte` | Nemotron status + download button (currently hidden by the bug) |
| `components/popups/LlmOptions.svelte` | LLM provider choice, API key, model list |
| `components/popups/LlmFiles.svelte` | Lists downloaded AI bin folders |
| `components/floating/AiFloating.svelte` | The floating widget: session sync, listen toggle, tabs |
| `components/floating/AiTranscription.svelte` | Live transcript + suggestion list (present/open/delete) |
| `components/floating/SmartAction.svelte` | The floating suggestion pill |
| `components/floating/AiChat.svelte` | Chat UI with executable action buttons |
| `components/floating/AiGenerate.svelte` | "Generate slide" button (edit page) |
| `components/floating/AiRing.svelte` | Animated listening ring |
| `components/floating/AiVisual.svelte` | State visualisation (mic/bubbles/level animation) |
| `components/floating/ConfidenceMeter.svelte` | Little confidence pie chart |

### Key files *outside* these folders
| File | Role |
|---|---|
| `public/assets/stt-processor.js` | The AudioWorklet that packages mic samples into 100 ms Int16 packets |
| `src/electron/IPC/responsesMain.ts` | Main-side IPC handlers: `AI_LISTEN_START`, `AI_AUDIO_DATA`, `AI_SETUP`, `AI_GET_STATUS`, `AI_LLM_COMPLETE`, keys |
| `src/frontend/IPC/responsesMain.ts` | Renderer-side: `AI_STATUS` → store, `AI_TRANSCRIPT` → Transcript |
| `src/frontend/MainLayout.svelte` | Mounts `AiFloating` globally |
| `src/frontend/components/actions/apiHelper.ts` | `startScripture()` (how a match is displayed), `toggle_stt_listening` |
| `src/frontend/stores.ts` | Stores: `ai`, `aiSttStatus`, `aiLlmStatus`, `aiSuggestions`, `aiSmartAction`, `sttTranscript`, `sttTempDisabled`, `mediaDownloads` |

---

## Part 6 — Existing tests & how to run them

- `src/frontend/ai/scripture/references.test.ts` — spoken-reference rewrites (EN/FR/ES/DE/NO).
- `src/frontend/ai/scripture/numbers.test.ts` — spoken numbers in 8 languages.
- `src/electron/ai/stt/sttHelper.test.ts` — loop breaking, confidence, music labels.
- Run: `npm run test:unit` (vitest, `config/testing/vitest.config.ts`).
- **No tests yet** for the detector's search/scoring, `AiManager` gates, or the download setup.

## Part 7 — Numbers worth remembering

| Thing | Value |
|---|---|
| Audio format | 16 kHz mono Int16, 100 ms packets |
| VAD | Silero, threshold 0.3, min silence 0.8 s, max speech 30 s |
| Transcript chunk | 120 words + 8 overlap; interim debounce 350 ms |
| Reference confidence | 98 (chapter:verse), 75 (chapter only), 80–85 (standalone/next) |
| Content match | clamp 51–98, discarded <70 |
| Auto-display floors | `ask` = never (default), medium >50, high >75, highest >95; absolute floor ≤50 never |
| Cooldown after manual output change | 30 s |
| Suggestions | max 15, expire after 5 min; pill 30 s (4 s if auto-presented) |
| Model size | ~682 MB total, `<userData>/bin/nemotron/models/` |
| Download | pinned HF revision, sha256 per file, `.part` + Range resume (3 attempts), `model.json` stamp |
