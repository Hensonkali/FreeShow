// Registry of every model file FreeShow may download.
// This is the single runtime source of download URLs, checksums and sizes.
// The same data is mirrored in models.json next to this file for humans and
// external tooling; models.test.ts fails if the two ever drift apart.

export interface ModelFileEntry {
    file: string
    url: string
    sha256: string
    bytes: number
}

export interface ManagedModel {
    // stable download key (also the progress/reporting key)
    id: string
    // STT engine id this model belongs to
    engine: string
    label: string
    // upstream model this export is built from
    source: string
    sourceUrl: string
    // pinned upstream revision, so exactly these bytes land
    revision: string
    license: string
    licenseUrl: string
    totalBytes: number
    // only openly licensed models may be downloaded automatically
    autoDownload: boolean
    files: ModelFileEntry[]
}

const NEMOTRON_REVISION = "cba1c96ca5ef0e8393b50584ae153a79145dc492"
const NEMOTRON_BASE_URL = `https://huggingface.co/csukuangfj2/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11/resolve/${NEMOTRON_REVISION}`
const NEMOTRON_VAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"

export const NEMOTRON_MODEL: ManagedModel = {
    id: "nemotron",
    engine: "nemotron",
    label: "Nemotron 3.5 streaming speech model (int8) with Silero voice activity detection",
    source: "nvidia/nemotron-3.5-asr-streaming-0.6b, int8 ONNX export by csukuangfj2",
    sourceUrl: "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b",
    revision: NEMOTRON_REVISION,
    license: "OpenMDW-1.1",
    licenseUrl: "https://openmdw.ai/license/1-1/",
    totalBytes: 682831755,
    autoDownload: true,
    files: [
        { file: "encoder.int8.onnx", url: `${NEMOTRON_BASE_URL}/encoder.int8.onnx`, sha256: "2fff2166acaa535bd969fb223c1f0783d71029f143cb298bc54c2afe85abf772", bytes: 657601521 },
        { file: "decoder.int8.onnx", url: `${NEMOTRON_BASE_URL}/decoder.int8.onnx`, sha256: "19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0", bytes: 14978075 },
        { file: "joiner.int8.onnx", url: `${NEMOTRON_BASE_URL}/joiner.int8.onnx`, sha256: "4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce", bytes: 9504438 },
        { file: "tokens.txt", url: `${NEMOTRON_BASE_URL}/tokens.txt`, sha256: "729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a", bytes: 103867 },
        { file: "silero_vad.onnx", url: NEMOTRON_VAD_URL, sha256: "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6", bytes: 643854 }
    ]
}

// MiniLM sentence embedding model (quantized ONNX, CPU only) for paraphrase
// verse search. Apache-2.0, so it may be downloaded automatically.
export const MINILM_MODEL: ManagedModel = {
    id: "embeddings",
    engine: "embeddings",
    label: "MiniLM sentence embedding model (quantized) for paraphrase verse search",
    source: "sentence-transformers/all-MiniLM-L6-v2, ONNX export by Xenova",
    sourceUrl: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
    revision: "main",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    totalBytes: 23685047,
    autoDownload: true,
    files: [
        { file: "model_quantized.onnx", url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx", sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1", bytes: 22972370 },
        { file: "tokenizer.json", url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json", sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0", bytes: 711661 },
        { file: "config.json", url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json", sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7", bytes: 650 },
        { file: "tokenizer_config.json", url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json", sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3", bytes: 366 }
    ]
}

// Swivuriso: Whisper large-v3-turbo fine-tune (MIT) by dsfsi-anv on the
// Swivuriso South-African-languages dataset. Not auto-downloaded (3.24 GB);
// see SWIVURISO_RESEARCH.md for the one-time conversion to whisper.cpp ggml.
export const SWIVURISO_MODEL: ManagedModel = {
    id: "swivuriso",
    engine: "swivuriso",
    label: "Swivuriso multilingual speech model (isiZulu + 6 more SA languages)",
    source: "dsfsi-anv/za-anv-multilingual-whisper-v3-turbo (Whisper large-v3-turbo fine-tune)",
    sourceUrl: "https://huggingface.co/dsfsi-anv/za-anv-multilingual-whisper-v3-turbo",
    revision: "main",
    license: "MIT",
    licenseUrl: "https://huggingface.co/dsfsi-anv/za-anv-multilingual-whisper-v3-turbo",
    totalBytes: 3235581408,
    autoDownload: false,
    files: [{ file: "model.safetensors", url: "https://huggingface.co/dsfsi-anv/za-anv-multilingual-whisper-v3-turbo/resolve/main/model.safetensors", sha256: "6d2cf738db827caaf0dd682c77f0d7a8c21ba060a4a395d13a273a87ec9d4d25", bytes: 3235581408 }]
}

export const MANAGED_MODELS: ManagedModel[] = [NEMOTRON_MODEL, MINILM_MODEL, SWIVURISO_MODEL]

export function getManagedModel(engineId: string): ManagedModel | undefined {
    return MANAGED_MODELS.find((model) => model.engine === engineId && model.autoDownload)
}
