# FreeShow — Architecture Mastery Guide

> FreeShow v1.6.7-beta.1 — a free/open-source (GPL-3.0) church presentation app.
> Stack: **Electron 37 + Svelte 3 + TypeScript 4.9 + Vite 4**, plus four embedded
> Express/socket.io web apps. Repo layout: `src/{electron,frontend,server,types}`.

---

## 1. The four top-level source trees

| Tree | Role | Scale |
|---|---|---|
| `src/electron` | Main process: windows, IPC handlers, disk persistence, servers, capture/NDI/RTMP, cloud, providers, AI | ~149 TS files, ~32k lines |
| `src/frontend` | The single renderer bundle used by **main window, output windows, and the PDF window** | 717 files, `components/` = 574 |
| `src/server` | 4 standalone PWA clients built by Vite → `build/electron/<id>/` | remote, stage, controller, output_stream (`cam` = dead code) |
| `src/types` | Shared domain model + IPC/socket contracts | `Show.ts` (681 L), `IPC/Main.ts` (~195 channels) |

Build orchestration: `scripts/start.js` (dev) runs Vite frontend (port 3000),
`scripts/vite/watchServers.js` (server apps on 3001–3004 for HMR), then Electron.
Production: `npm run build` = frontend Vite build + `createServerFiles.js` (4 server
bundles) + `tsc` for Electron (`build/electron/index.js`, **not bundled**).

---

## 2. Window model & identity handshake

The **same renderer bundle** runs in every Electron window. Role is decided at runtime:

```
main process: loadWindowContent(window, type)   // type: null | "output" | "pdf"
   ↓ listens on STARTUP channel for {channel:"READY"}
renderer: startup() in src/frontend/utils/startup.ts sends {channel:"READY"}
   ↓ main replies {channel:"TYPE", data: type}
renderer: currentWindow.set(type) → branches:
   null     → startupMain()   → App.svelte renders <MainLayout/>
   "output" → startupOutput() → App.svelte renders <MainOutput/>
   "pdf"    → returns         → App.svelte renders <Pdf/>
```

Window types (`src/electron/utils/windowOptions.ts`): loading splash, main, output
(per-output, always-on-top/frameless, may be **offscreen** for capture), PDF export
window (hidden), thumbnail capture window (`offscreen:true`), screen-identify overlays.

### Output pipeline (Electron side)
- `src/electron/output/OutputHelper.ts` — static registry `{[id]: Output}`, dispatches
  the `OUTPUT` IPC channel (`CREATE`, `REMOVE`, `MOVE`, `SET_VALUE`, `CAPTURE`, …).
- `helpers/OutputLifecycle.ts` (953 L) — creates windows, offscreen paint capture,
  NDI/OMT/Blackmagic sender startup, display hot-plug restore.
- `helpers/OutputSend.ts` — fan-out to output windows (skips "shared-render followers").
- `capture/helpers/CaptureTransmitter.ts` (696 L) — per-consumer frame delivery:
  NDI / OMT / Blackmagic / server stream / stage / WebRTC / RTMP / recorder.

---

## 3. IPC layer (renderer ⇄ main)

**Channels** — `src/types/Channels.ts`:
`STARTUP, MAIN, OUTPUT, EXPORT, REMOTE, STAGE, CONTROLLER, OUTPUT_STREAM, CLOUD, NDI, OMT, BLACKMAGIC, AUDIO`

### The typed request/response channel `MAIN`
- Contract: `src/types/IPC/Main.ts` — `enum Main` (~195 request channels) +
  `MainSendPayloads` / `MainReturnPayloads` / `MainResponses` (handler types).
  `src/types/IPC/ToMain.ts` — `enum ToMain` (main→renderer notifications, e.g. `ALERT`, `TOAST`, `MENU`, `IMPORT2`, `SAVE2`).
- Main side: `src/electron/IPC/main.ts` (`sendToMain`, `receiveMain`,
  `requestToMain`) + `src/electron/IPC/responsesMain.ts` (546 L, **the handler table**).
- Renderer side: `src/frontend/IPC/main.ts` (`requestMain`, `sendMain`,
  `receiveMainGlobal` — returns handler values back over `MAIN`) +
  `src/frontend/IPC/responsesMain.ts` (624 L, inbound handlers incl. `IMPORT2` dispatch).
- Preload: `src/electron/preload.ts` exposes `window.api.{send,receive,removeListener}`
  plus MessagePort forwarding for `STREAM_PORT` / `AUDIO_PORT`.

**Pattern:** renderer → `window.api.send(MAIN, {channel, data}, listenerId)` →
`mainResponses[channel]` → domain module → reply correlated by `listenerId`.

Untyped sibling channels (`OUTPUT`, `REMOTE`, `STAGE`…) go through
`src/frontend/utils/request.ts` (`send`/`receive`/`destroy`).

---

## 4. Data model (`src/types`)

### Core show model — `src/types/Show.ts`
```
Show { name, category, settings:{activeLayout, template}, timestamps,
       slides:{[id]: Slide}, layouts:{[id]: Layout}, media:{[id]: Media}, meta, origin? }

Slide { group, color, children?, notes, items: Item[], settings, customDynamicValues? }
Item  { type?: ItemType, lines?: Line[], style /* raw CSS */, media?, timer?, clock?,
        weather?, variable?, web?, qr_code?, chart?, table?, bindings?, chords?, ... }
ItemType = text|media|camera|timer|clock|button|events|weather|variable|web|qr_code|
           icon|slide_tracker|visualizer|captions|metronome|current_output|chart|table

Layout { name, notes, slides: SlideData[] }      // a layout = playlist over shared slides
SlideData { id, background?, overlays?, effects?, audio?, transition?, actions?,
            bindings?, nextTimer?, disabled?, ... }
LayoutRef { type:"parent"|"child", id, index, layoutIndex, data: SlideData, ... }
```
Other types in the same file: `Timer`, `Clock`, `DynamicEvent`, `Scrolling`,
`Condition`, `Media`, `Action` (MIDI/trigger), `Emitter`, `Overlay`, `Template`
(+ `TemplateSettings` incl. scripture mode), `Scene`, `OutBackground/OutSlide/
OutTransition/OutScene` (live output payload), `SlideTimer`, `Tag`.

### Related models
- **Projects** (`src/types/Projects.ts`): tree via `parent` (`"/"` = root);
  `Project.shows: ProjectShowRef[]` **is the rundown/queue** (no separate queue entity).
  `projectTemplates`, `folders`.
- **Outputs** (`src/types/Output.ts`): `Output { bounds, screen, style, out: OutData,
  stageOutput?, blending?, ndi?/omt?/blackmagic?/webrtc?/rtmp?, ... }`;
  `OutData = { slide, background, overlays, effects, transition, scene }`.
  `syncedOutputs` = outputs sharing content. `outputs` store lives in SETTINGS.
- **Stage** (`src/types/Stage.ts`): `StageLayout { settings, items:{[id]:StageItem} }` —
  confidence-monitor layouts; an output with `stageOutput = <layoutId>` renders
  `<StageLayout edit={false}>` instead of slides.
- **Settings** (`src/types/Settings.ts`): `Styles` (output presets: layers, transition,
  fit, aspectRatio, cropping, scripture templates), `Themes` (colors/fonts → CSS vars),
  `Dictionary` (i18n), `Profile` (access control).
- **Effects** (`src/types/Effects.ts`): 28 typed animated effect kinds.

---

## 5. State & persistence (the heart of the app)

### Stores — `src/frontend/stores.ts` (529 L)
Every piece of state is a Svelte `Writable`, split into:
- **Temporary** (session): `currentWindow`, `activeShow`, `activeProject`, `selected`,
  `connections`, `outputs` runtime (`outputState`, `outputCache`), `playingAudio`, AI status…
- **Saved** (persisted): `shows` (trimmed index), `showsCache` (full content),
  `projects`/`folders`, `overlays`, `templates`, `stageShows`, `events`, `themes`,
  `styles`, `timers`, `variables`, `scenes`, `groups`, `categories`, `settings`-ish keys,
  `undoHistory`/`redoHistory`, `ports`/`disabledServers`/`serverData`, `ai`, …
- **Registry `$`** (lines 414–512): a plain object of ~100 stores for dynamic access
  (`import { $ } from "../stores"` → `$.shows.subscribe(...)`).

### Persistence loop
```
stores change → utils/save.ts save() builds SaveData (src/types/Save.ts)
   → sendMain(Main.SAVE, data)
   → src/electron/data/save.ts: diff each store → safeStoreSet() (3 retries)
      → writes shows:  <root>/Shows/<name>.show   = JSON [id, Show]
      → writes bibles: <root>/Bibles/<name>.fsb   = JSON [id, Bible]
      → electron-store JSON in <root>/Config/     (settings.json, settings_synced.json,
        projects.json, overlays.json, templates.json, stage.json, themes.json, events.json,
        history.json, media.json, cache.json, usage.json, shows.json, access.json, …)
   → ToMain.SAVE2 → renderer saveComplete() (+ cloud sync / close)
```
- Data root: `config.dataPath`, default **`Documents/FreeShow`** (folders: `Shows`,
  `Backups`, `Bibles`, `Media`, `Exports`, `Imports`, `Config`, `Cloud`, … — full list in
  `src/electron/utils/files.ts` `dataFolderNames`).
- Two settings buckets: `SaveListSettings` (device-local) vs `SaveListSyncedSettings`
  (team/cloud-synced) — see `src/types/Save.ts`.
- Dirty tracking: `unsavedUpdater()` JSON-stringifies all saved stores.
- Autosave interval store; auto-backup zips portable stores + shows → `Backups/*.zip`.
- **Startup load**: `startupMain()` → `getStoredData()` bulk-requests stores, then
  `Main.SHOWS` (folder scan in `files.ts loadShowsAsync`, 50-file batches, text cache),
  individual shows loaded **lazily** via `Main.SHOW`. Hydration in
  `utils/updateSettings.ts updateSettings/updateSyncedSettings` (includes legacy
  migrations), then `restartOutputs()`.

### Show access API — `_show()`
`src/frontend/components/helpers/shows.ts` (740 L):
```ts
_show("active").get("name")
_show().set({ key: "settings.activeLayout", value: id })
_show().slides([id]).items([i]).lines([l]).set({ key, value })
_show().layouts(["active"]).ref()[0]   // LayoutRef[]
```
Mutations touch `timestamps.modified`.

### History / undo
Every mutation goes through `history({id, newData, oldData, location})` in
`components/helpers/history.ts` → `historyActions.ts` (action table) →
`undoHistory`/`redoHistory` stores (cap 75, persisted, self-healing >30 MB → delete).
Generic store CRUD via `historyNew(type, value)`.

---

## 6. Frontend structure & navigation

### Shell — `src/frontend/MainLayout.svelte`
```
┌ MenuBar (Windows) ──────────────────────────────────────┐
│ Top bar → components/main/Top.svelte                    │
├ LEFT (Resizeable) ┬ CENTER (flex 1) ────┬ RIGHT (Resizeable) ┤
│ activePage:       │ activePage:         │ Preview.svelte     │
│  show  → Projects │  show  → Show.svelte│ + per-page Tools   │
│  edit  → Navigation│ edit  → Editor     │ (ShowTools,        │
│  stage → StageLayouts│ stage→StageLayout│  EditTools, …)     │
│  draw  → DrawTabs │  draw  → draw/Slide │                    │
│  settings→SettingsTabs│ settings→Settings│                   │
├───────────────────┴─────────────────────┴────────────────────┤
│ Drawer (show/edit pages) · Tipbar · AiFloating              │
└──────────────────────────────────────────────────────────────┘
```
`activePage: TopViews = "show" | "edit" | "reflow" | "draw" | "stage" | "calendar" | "settings"`
Drawer tabs: `shows | media | overlays | audio | scripture | calendar | timers | templates | functions`.

### Key component folders (under `src/frontend/components/`)
| Folder | Role |
|---|---|
| `show/` | Project browsing & slide grid (`Projects.svelte`, `Show.svelte`, `Slides.svelte`) |
| `edit/` | Editor mode: `Editor.svelte`, `editbox/` (on-canvas editing), `editors/`, `tools/` |
| `slide/` | Rendering primitives: `Slide.svelte`, `Textbox.svelte`, `Layouts.svelte`, `Zoomed.svelte`, `views/` (Timer, Chart, Table, Website, QrCode, Captions, Variable…) |
| `output/` | `Output.svelte` (layer stack), `layers/`, `transitions/`, `preview/`, `effects/effectRenderer.ts` (114 KB, WebGL/canvas) |
| `stage/` | Stage layout editor + renderer |
| `drawer/` | Bottom drawer (118 files; bible/scripture 99 KB) |
| `helpers/` | **The logic core**: `output.ts` (85 KB, output/style engine), `showActions.ts` (71 KB, `updateOut`), `shows.ts` (`_show()`), `history*.ts`, `clipboard.ts` |
| `actions/` | Trigger engine: `actions.ts`, **`api.ts` (162 API action handlers)**, `midi.ts`, `emitters.ts` (OSC/HTTP/MIDI) |
| `context/` | Right-click: `menuClick.ts` (93 KB switchboard) |
| `main/` | Chrome: `Top.svelte`, `Popup.svelte` + ~90 popups, `MenuBar.svelte` |
| `settings/` | Settings tabs (General/Outputs/Styles/Theme/Connection/Files/Profiles/AudioRouting/AI/Other) |
| `quicksearch/` | Ctrl+P palette |
| `timeline/` | Timeline editing + playback, timecode |

### Output rendering — `components/output/Output.svelte`
Layer order inside `<Zoomed>`: background → scene media → background layer → colorbars →
under-effects → underlays → **slide** (`SlideContent.svelte`) → metadata → over-effects →
overlays → attribution → draw overlay. Heavy JSON-string diffing for re-clones.

Transitions: precedence **slide > style > global `transitionData`**; types none/blur/fade/
crossfade/fly/scale/slide/spin (`utils/transitions.ts`).

**Data flow to output windows:**
```
main window: setOutput()/updateOut() writes outputs[id].out
  → utils/listeners.ts storeSubscriber() → send(OUTPUT, ["OUTPUTS"], …) (throttled)
  → output window receiveOUTPUTasOUTPUT (utils/receivers.ts) → stores → Output.svelte
  (new output window asks REQUEST_DATA_MAIN → sendInitialOutputData())
```

### i18n & themes
- `utils/language.ts setLanguage()` fetches `public/lang/<locale>.json` (30+ languages),
  merges missing keys from `en.json`, RTL for `ar, fa, he, ur`. `<T id="…"/>` component.
- Themes: `updateThemeValues()` writes colors/fonts as CSS custom properties
  (`--primary`, `--font-…`) on `:root`; components use `var(--…)`.

---

## 7. Servers & remote control

### The four embedded servers — `src/electron/servers.ts`
| id | port | app | purpose |
|---|---|---|---|
| `REMOTE` | 5510 | RemoteShow | phone/tablet remote |
| `STAGE` | 5511 | StageShow | confidence monitor |
| `CONTROLLER` | 5512 | ControlShow | clicker + output thumbnail |
| `OUTPUT_STREAM` | 5513 | OutputShow | browser output mirror + audio |

Each = express + http + socket.io, serving `build/electron/<id>/` (Vite IIFE bundle
`client.js`, `styles.css`, `index.html`, `manifest.json`, `sw.js`).
**socket.io event name = the server id** in both directions (`io.emit("REMOTE", msg)`).
Started only when the renderer sends `Main.START` (Settings → Connection); published via
Bonjour/mDNS (`data/bonjour.ts`, `_freeshow._udp`). Connection cap default 10.

**Protocol** (`src/types/Socket.ts`): `Message {channel, data?, id?, name?, path?}`.
Renderer-side dispatch: `utils/receivers.ts remoteListen()` → `utils/sendData.ts`
`client()`/`sendData()` → `remoteTalk.ts` / `stageTalk.ts` / `controllerTalk.ts` handlers.
- Auth: REMOTE password checked in `sendData()` (renderer-side gate).
- Stage frames: subscription-gated (`STREAM_SUBSCRIBE`, 10 s TTL), JPEG ≤1280 px @10 fps.
- Output stream frames: ack-gated (`STREAM` / `STREAM_DONE`), RGBA to canvas, scales
  down with viewer count. Controller thumbnail: `OUTPUT_FRAME` poll every 800 ms.
- PWAs: `src/server/sw.js` = stale-while-revalidate cache so clients work on flaky Wi-Fi.

### Companion / external control API — `src/electron/utils/api.ts`
- **WebSocket 5505** (socket.io `"data"`), **REST 5506** (`{action,…}` or `?action=`),
  **OSC UDP 5505** (`/freeshow/*`). Optional password/Bearer auth.
- Dispatch: → `ToMain.API_TRIGGER2` → renderer `API_ACTIONS` (`components/actions/api.ts`,
  **162 handlers**: next_slide, select_project, clear_*, play_media, start_scripture,
  get_* getters, obs_*, spotify_*, timers, …). Results returned via `Main.API_TRIGGER`.
- Inbound emitters: MIDI (JZZ), OSC (`osc-js`, patched in `utils/oscPatch.ts`), REST/HTTP.

### Remote Clicker (no LAN needed)
`utils/remoteController.ts` — Firebase RTDB `control/{id}`, public URL
`https://freeshow.net/control?id=<6char>`; commands `next`/`previous`.

---

## 8. Electron-side subsystems (main process)

| Subsystem | Location | Notes |
|---|---|---|
| Capture/OSR | `capture/` | offscreen paint → per-consumer fan-out; `StreamReceiverHost` forks a utilityProcess for NDI/OMT receive |
| NDI / OMT / Blackmagic | `ndi/`, `omt/`, `blackmagic/` | `grandiose`, `openmediatransport`, `macadam` (lazy-loaded, 1139 L sender) |
| Streaming | `streaming/` | `RtmpStreamer` (spawns ffmpeg), `WebRtcHost` (WHIP), encoder detection/download |
| Audio | `audio/` | MessagePort PCM → Opus encode → NDI/OMT/BMD/stream/Icecast; `nowPlaying` |
| Cloud sync | `cloud/` | Google Drive service-account sync (`syncManager` 760 L + ledger), ChurchApps sync |
| Content providers | `contentProviders/` | registry: Planning Center (OAuth 5501), ChurchApps (5502), OnStage (5503), Canva (5520), AmazingLife |
| AI | `ai/` | LLM providers (anthropic/openai/google/ollama), STT (sherpa-onnx local model download) |
| Timecode | `timecode/` | LTC (`libltc-wrapper`) + MTC |
| Data ops | `data/` | store.ts (21 electron-store JSONs, portable flag), save.ts, backup.ts (zip), import.ts, export.ts (PDF via hidden window), thumbnails.ts, protected.ts (AES `freeshow-protected:` protocol), zip.ts |
| Utils | `utils/` | `files.ts` (1473 L — all disk IO), `api.ts`, `spotify.ts` (per-OS bridge), `midi.ts`, `LyricSearch.ts` (Genius/UG/Letras/Hymnary), `gpu.ts`, `keys.ts`, `updater.ts` |
| Close flow | `utils/close.ts` | close → renderer prompt → `closeMain()` → `exitApp()` teardown order |

---

## 9. Secondary features quick map

- **Scripture**: `components/drawer/bible/scripture.ts` (99 KB) — API bibles
  (api.churchapps.org) + local `.fsb`, `json-bible` package, verse grouping/smart split,
  `{scripture_text}` placeholders; import zefania/osis/beblia/opensong (no USFM).
- **Converters** (`src/frontend/converters/`, 29 files): ProPresenter, EasyWorship,
  VideoPsalm, SongBeamer, OpenLP/OpenSong, Quelea, MediaShout, SoftProjector, EasySlides,
  VerseView, ChordPro, PowerPoint (4 routes), Word, PDF, CSV/TXT, Bible, ICS calendar.
- **Draw/telestration**: `components/draw/` — focus/pointer/zoom/paint/particles/fill.
- **Timers/Events**: `timerTick.ts`; events (`type: event|action|show|timer`) with
  repeats + toasts + `runAction`.
- **Audio engine** (`src/frontend/audio/`, 25 files): Web Audio player, playlists,
  crossfade, sidechain ducking, multichannel routing matrix, effects stack (EQ/compressor/
  reverb/…), mic capture, waveform/spectrum.
- **Media**: `cameraManager.ts` (getUserMedia ref-counting), `videoPlayer.ts`,
  thumbnails via main-process offscreen capture.
- **History/undo** (above), **Profiles** (password + per-area access), **QuickSearch**,
  **Timeline + timecode**, **Variables/Interactions/Scenes**, **OBS WebSocket** (`obsTalk.ts`,
  default 4455), **Analytics/RSS/Weather**, **Guide** (first-run tour).

---

## 10. Gotchas & conventions

1. **One renderer bundle, three roles** — always check `currentWindow` before assuming UI.
2. **`MAIN` is typed request/response; other channels are stringly-typed** — channel
   names appear in `types/Channels.ts`, `types/IPC/Main.ts`, and socket events alike.
3. **`ClientChannels` in `Socket.ts` is under-typed** (18 declared vs hundreds at runtime).
4. **`src/server/cam` is dead code** — never built.
5. **Port collisions**: 5502 claimed by ChurchApps OAuth *and* `RESERVED_PORTS.nowPlaying`.
6. **Two stage-stream viewer registries** (main `stageStreamSubscribers` + renderer
   `viewers` in `stageTalk.ts`) must stay in sync — both 10 s TTL.
7. **`outputs[id].out` is stripped before saving**; runtime state never persists.
8. **`Media` means two things**: `Show.media` (show assets) vs global `media.json`
   (per-path `MediaStyle`, dot-notation disabled because paths contain dots).
9. Style/lint gates: `npm run lint`, `npm test` (vitest + playwright + prettier + svelte-check).
10. Native deps need `electron-builder install-app-deps` (postinstall) and per-package
    rebuilds (`rebuild-opus`, `rebuild-osr`); requires Python 3.12 + VS C++ build tools.
