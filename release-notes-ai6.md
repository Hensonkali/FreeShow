## FreeShow 1.6.7-ai6 — offline fork, fully audited and repaired

This build makes the offline fork actually work end-to-end. Everything in the list was
built, installed and verified on the development machine this release was cut from.

**Offline correctness (all fixed this release)**
- The installed app was shipping the OLD main process (Sentry, cloud sync, online updater bundled) — the offline main code had never been compiled into the installer. Now it is, and it is verified inside the asar.
- Renderer still initialized Sentry at startup, and the home screen silently phoned home to Google Analytics (voice/verse tracking) — both removed; every scripture display sent a GA beacon before this release.
- `en.json` had a syntax error — the English UI showed raw translation keys (`[about.new_update]`) on EVERY launch of the fork. Fixed; the English dictionary is now also bundled inside the JS so i18n can never silently fail again (build fails loudly on broken language JSON).
- Startup performed an automatic update check against the UPSTREAM project and offered it as an update. Removed. Update links now point at this fork's release channel only.
- Bible auto-install copied bundled Bibles into the wrong folder (they never loaded). Now they install into Documents\FreeShow\Bibles on first run (verified).
- Bundled Bibles were corrupt partial files (invalid JSON, key verses only). Replaced with FULL public-domain translations: KJV (31,102 verses), ASV (31,102), WEB (31,095). All parse, verified, psalm markers stripped.
- `syncDrive` and `startTracking` were called but never imported — every save threw (see %APPDATA%\FreeShow\error_log.json's three "syncDrive is not defined" entries from older builds). Fixed; verified zero new errors since.
- `autoErrorReport` export missing, 27 missing IPC handler stubs, embedding setup missing import — all fixed; electron tsc is clean.
- Analyzing 8 GB-class machines: AI defaults now target them (embedding default off, paraphrase off by default, opt-in).

**Verified and measured**
- Offline paraphrase pipeline runs end-to-end (MiniLM quantized ONNX, CPU): exact quotes ~0.99, loose paraphrases 0.65–0.78, unrelated text <0.2. Latency ~7 ms/verse, model loads in ~0.4 s.
- Bundled KJV/WEB/ASV pre-indexed on the dev machine (full vectors in userData).
- Unit tests: 209 passed, 0 failed. Electron tsc clean (frontend baseline errors unchanged; none in fork files).
- App verified running after silent install; no new errors in the renderer log.

**Known limitations / not yet verified on this machine**
- Speech-to-text end-to-end latency (Nemotron streaming) was not re-benchmarked this build; the "≤3s verse display" goal comes from the upstream AI pipeline and 3 s chunks.
- NDI → OBS over LAN output was not tested on this machine (needs a second PC with OBS attached).
- Uploading the installer to GitHub may still be slow on your connection — the release is created with the installer attached when upload completes.
- The "WebSearch" / remote controller / Drive sync features remain in the app for compatibility but are inert or user-configured only.
- Translations bundled are KJV, ASV, WEB (all public domain). Your own full Bibles (e.g. Zulu 2020) are used locally and are NOT redistributed by this build.

**Install:** run `FreeShow-1.6.7-beta.1-x64.exe` (or with `/S` for silent install), then Settings → Smart → Enable to start scripture detection. The speech model downloads on first Smart use (~650 MB).
