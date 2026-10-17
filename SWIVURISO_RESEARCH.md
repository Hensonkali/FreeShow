# SWIVURISO_RESEARCH.md — Step 11: offline South-African-language speech recognition

*Research deliverable (no engine code decisions were made before this report).*

## What "Swivuriso" actually is

**Swivuriso** (ZA African Next Voices, DSFSI / University of Pretoria) is a **dataset**, not a model:
~3,016 hours of speech across isiZulu (503h), isiXhosa (504h), Sesotho (504h), Setswana (502h),
Xitsonga, isiNdebele (250h) and Tshivenda (250h) — CC-BY-4.0, no TTS/cloning allowed.
The ASR **models** fine-tuned on it (the "open Swivuriso model" from the plan) are Whisper
Large-V3-Turbo fine-tunes published by `dsfsi-anv` under **MIT** — confirmed from the model cards:

| Model | Languages | WER (paper, final epoch) | Files published |
|---|---|---|---|
| `dsfsi-anv/whisper-large-v3-turbo-anv-zul` | isiZulu only | 15.0% (CER 5.1%) | `model.safetensors` only, **3.24 GB fp32** |
| `dsfsi-anv/za-anv-multilingual-whisper-v3-turbo` | all 7 SA languages | 15.0% avg | `model.safetensors` only, **3.24 GB fp32** |
| `dsfsi-anv/whisper-small-anv-zulu-first-batch` | isiZulu | (earlier, weaker) | smaller, faster |

Base Whisper large-v3-turbo **does not support isiZulu** — the fine-tune is what makes Zulu work.

## The target machine (measured)

ThinkPad T14: Intel i5-10310U (4 cores / 8 threads, AVX2, no AVX-512), 16 GB RAM, Intel UHD
Graphics (no dGPU, no usable WebGPU). **No Visual Studio C++ build tools installed.**

## Options compared

| Option | Runs on this PC? | Accuracy (Zulu) | Speed on i5-10310U (est.) | Memory (est.) | Blocker |
|---|---|---|---|---|---|
| **A. whisper.cpp + q5_0 ggml of the MIT fine-tune** | Yes (CPU, SIMD) | Best available (WER ~15%) | 6s chunk ≈ **8–20s**; ~1.5–3× real-time | ~1.0–1.4 GB | No official prebuilt Windows binary; model needs conversion |
| B. faster-whisper (CTranslate2 int8) | Yes | Same as A | similar, slightly better on long audio | ~0.9 GB | Python runtime required — not embeddable in Electron |
| C. ONNX Runtime (like our MiniLM) | Yes | Same | slow for seq2seq decoding on CPU | ~1.5 GB | No published ONNX; conversion needs Python+torch |
| D. transformers.js (WASM) in renderer | Yes | Same | 5–15× slower than native | ~2 GB | Same conversion gap + WASM overhead |
| E. W2V2-BERT / MMS Swivuriso baselines | Yes | Worse than Whisper fine-tune (paper) | — | — | Same conversion gap, lower accuracy |
| F. Cloud ASR | — | — | — | — | Rejected: everything must work offline in the church |

**Recommendation: Option A** — whisper.cpp with the multilingual fine-tune converted to ggml
(q5_0, ~570 MB). It is the only option that is native, offline, dependency-free at runtime,
MIT-clean, and reuses FreeShow's existing download/verify machinery.

## The honest gap, and how the built engine handles it

Two one-time artifacts are needed and **cannot be produced on this ThinkPad**:
1. `whisper-cli.exe` — whisper.cpp's Windows binary. No compiler is installed here, and the
   project publishes **no prebuilt Windows binaries** (checked latest releases of both
   `ggml-org/whisper.cpp` and `ggml-org/whisper.cpp-bins`: zero Windows assets).
2. `model-ggml.bin` — the fine-tune ships only as 3.24 GB fp32 safetensors; converting to ggml
   needs Python (+ optional torch), impractical to install over a 10 KB/s line.

**One-time prep on any other machine (a free Google Colab works, ~15 min):**
```bash
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
cmake -B build -DGGML_NATIVE=OFF && cmake --build build -j --config Release   # → whisper-cli.exe equivalent
pip install -q torch transformers optimum safetensors numpy
# download the MIT fine-tune and convert to ggml, then quantize:
python models/convert-h5-to-ggml.py   # (see whisper.cpp/models/ for the current safetensors converter)
./build/bin/quantize models/ggml-model-turbo.bin models/model-ggml.bin q5_0
```
Copy `whisper-cli(.exe)` + `model-ggml.bin` into:
`C:\Users\<you>\AppData\Roaming\FreeShow\bin\swivuriso\` (binary) and `...\bin\swivuriso\models\` (model).

The engine shipped in this fork:
- detects both files and turns **ready** with zero further setup;
- otherwise shows exactly what is missing and offers the resumable 3.24 GB safetensors download
  (10 KB/s ≈ 3–4 days; it resumes across restarts — partial files are never lost);
- listens in **6-second chunks** (the plan's 5–8s window), always transcribing the *latest*
  chunk (backlog is dropped on this CPU so detection keeps following the preacher instead of
  lagging behind);
- runs **next to** the English Nemotron engine — pick the engine in Smart settings.

## Accuracy / speed / memory numbers to expect on this ThinkPad

- **Accuracy:** ~15% WER on clean in-domain Zulu (paper, multilingual fine-tune); sermon audio
  with music/ambient noise will be worse — the reference parser + n-gram matcher were built to
  absorb exactly those errors. English via the same multilingual model stays usable.
- **Speed:** large-v3-turbo q5_0 ≈ 1.5–3× real-time on 4 AVX2 cores → a 6s utterance returns in
  roughly **8–20s**. Verdict: **fine for follow-along suggestions, NOT for instant auto-display.**
  Zulu auto-display defaults to off; suggestions still appear with confidence scores.
- **Memory:** ~1.0–1.4 GB while decoding — fits comfortably in 16 GB alongside FreeShow.

## Sources
- Paper: arXiv 2512.02201 (Swivuriso; baselines Whisper-LV3T / W2V2-BERT 2.0 / MMS; cross-corpus
  robustness: NCHLT-trained models collapse on real speech, Swivuriso-trained generalize).
- Models: huggingface.co/dsfsi-anv (MIT; 3,235,581,408-byte safetensors; sha256 recorded in
  `src/electron/ai/setup/models.json`).
- whisper.cpp: github.com/ggml-org/whisper.cpp (MIT) — Windows assets absent from current releases.
