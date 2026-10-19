import { app } from "electron"
import fs from "fs"
import path from "path"
import type { EmbeddingCandidate } from "../../../types/ai/Ai"
import { createFolder } from "../../utils/files"
import { encode, meanPool, padBatch, buildVocab, type WordPieceVocab } from "./wordpiece"

// Local paraphrase search over Bible verses with the MiniLM quantized model.
// CPU only, everything on disk under <userData>/bin/embeddings/.
// onnxruntime-node is required lazily so importing this module never pulls
// the native library (keeps unit tests and app startup light).

const MODEL_FILE = "model_quantized.onnx"
const TOKENIZER_FILE = "tokenizer.json"
const VECTORS_DIR = "vectors"
const INDEX_BATCH_SIZE = 32

export interface IndexedVerse {
    ref: string
    text: string
}

interface VectorSidecar {
    model: string
    dims: number
    count: number
    refs: string[]
}

function getEmbedDir() {
    return path.join(app.getPath("userData"), "bin", "embeddings")
}

function getModelPath() {
    return path.join(getEmbedDir(), MODEL_FILE)
}

function getVectorPaths(bibleId: string) {
    const dir = path.join(getEmbedDir(), VECTORS_DIR)
    return { matrix: path.join(dir, `${bibleId}.f32`), sidecar: path.join(dir, `${bibleId}.json`) }
}

// flatten a loaded .fsb bible ([id, Bible]) into indexable verses
export function extractVerses(bibleContent: any): IndexedVerse[] {
    const bible = Array.isArray(bibleContent) ? bibleContent[1] : bibleContent
    const verses: IndexedVerse[] = []
    for (const book of bible?.books || []) {
        for (const chapter of book?.chapters || []) {
            for (const verse of chapter?.verses || []) {
                const text = (verse?.text || "").trim()
                if (!text) continue
                verses.push({ ref: `${book.name} ${chapter.number}:${verse.number}`, text })
            }
        }
    }
    return verses
}

type OrtModule = typeof import("onnxruntime-node")

class EmbeddingEngine {
    private ort: OrtModule | null = null
    private session: any = null
    private vocab: WordPieceVocab | null = null
    private dims = 0
    private loadError = ""

    private loadedBibleId = ""
    private loadedMatrix: Float32Array | null = null
    private loadedRefs: string[] = []

    private indexingBibleId = ""

    isModelReady(): boolean {
        return fs.existsSync(getModelPath()) && fs.existsSync(path.join(getEmbedDir(), TOKENIZER_FILE))
    }

    getLoadError() {
        return this.loadError
    }

    isIndexing() {
        return this.indexingBibleId
    }

    async ensureLoaded(): Promise<boolean> {
        if (this.session) return true
        if (!this.isModelReady()) {
            this.loadError = "Embedding model files are missing"
            return false
        }
        try {
            if (!this.ort) this.ort = require("onnxruntime-node") as OrtModule
            const ort = this.ort
            const tokenizer = JSON.parse(fs.readFileSync(path.join(getEmbedDir(), TOKENIZER_FILE), "utf8"))
            this.vocab = buildVocab(tokenizer.model?.vocab || {})
            this.session = await ort.InferenceSession.create(getModelPath(), { executionProviders: ["cpu"], logSeverityLevel: 3, intraOpNumThreads: 2, interOpNumThreads: 1 })
            const output = this.session.outputNames[0]
            const metadata = this.session.outputMetadata?.[0]?.[output]
            this.dims = metadata?.dimensions?.[2] || 384
            return true
        } catch (err) {
            this.loadError = err instanceof Error ? err.message : String(err)
            this.session = null
            return false
        }
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        if (!(await this.ensureLoaded()) || !this.session || !this.vocab) throw new Error(this.loadError || "Embedding model is not ready")
        const ort = this.ort
        const vocab = this.vocab
        const session = this.session
        if (!ort || !vocab || !session) throw new Error(this.loadError || "Embedding model is not ready")

        const encoded = texts.map((text) => encode(text, vocab))
        const padded = padBatch(encoded, vocab.padId)
        const rows = padded.inputIds.length
        const cols = padded.inputIds[0].length

        const flatIds = new BigInt64Array(rows * cols)
        const flatMask = new BigInt64Array(rows * cols)
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                flatIds[i * cols + j] = BigInt(padded.inputIds[i][j])
                flatMask[i * cols + j] = BigInt(padded.attentionMask[i][j])
            }
        }

        const feeds: Record<string, any> = {
            input_ids: new ort.Tensor("int64", flatIds, [rows, cols]),
            attention_mask: new ort.Tensor("int64", flatMask, [rows, cols])
        }
        if (session.inputNames.includes("token_type_ids")) {
            feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(rows * cols), [rows, cols])
        }

        const output = await session.run(feeds)
        const hidden = output[session.outputNames[0]].data as Float32Array

        return encoded.map((item, i) => meanPool(hidden.subarray(i * cols * this.dims, (i + 1) * cols * this.dims), cols, this.dims, item.attentionMask))
    }

    getIndexStatus(bibleId: string): { indexed: number; total: number } {
        const paths = getVectorPaths(bibleId)
        try {
            const sidecar: VectorSidecar = JSON.parse(fs.readFileSync(paths.sidecar, "utf8"))
            if (sidecar.model === MODEL_FILE && fs.existsSync(paths.matrix)) return { indexed: sidecar.count, total: sidecar.count }
        } catch {}
        return { indexed: 0, total: 0 }
    }

    private loadVectors(bibleId: string): boolean {
        if (this.loadedBibleId === bibleId && this.loadedMatrix) return true
        const paths = getVectorPaths(bibleId)
        try {
            const sidecar: VectorSidecar = JSON.parse(fs.readFileSync(paths.sidecar, "utf8"))
            const buffer = fs.readFileSync(paths.matrix)
            if (buffer.length !== sidecar.count * sidecar.dims * 4) return false
            this.loadedMatrix = new Float32Array(buffer.buffer, buffer.byteOffset, sidecar.count * sidecar.dims)
            this.loadedRefs = sidecar.refs
            this.loadedBibleId = bibleId
            this.dims = sidecar.dims
            return true
        } catch {
            return false
        }
    }

    async indexBible(bibleId: string, verses: IndexedVerse[], onProgress?: (indexed: number, total: number) => void): Promise<boolean> {
        if (this.indexingBibleId) return false
        if (!(await this.ensureLoaded())) return false
        this.indexingBibleId = bibleId

        try {
            const matrix = new Float32Array(verses.length * this.dims)
            for (let i = 0; i < verses.length; i += INDEX_BATCH_SIZE) {
                const batch = verses.slice(i, i + INDEX_BATCH_SIZE)
                const vectors = await this.embed(batch.map((verse) => verse.text))
                vectors.forEach((vector, j) => matrix.set(vector, (i + j) * this.dims))
                onProgress?.(Math.min(i + batch.length, verses.length), verses.length)
            }

            const paths = getVectorPaths(bibleId)
            createFolder(path.dirname(paths.matrix))
            fs.writeFileSync(paths.matrix, Buffer.from(matrix.buffer))
            fs.writeFileSync(paths.sidecar, JSON.stringify({ model: MODEL_FILE, dims: this.dims, count: verses.length, refs: verses.map((verse) => verse.ref) }))

            this.loadedBibleId = ""
            this.loadedMatrix = null
            return true
        } catch (err) {
            console.error(`[embeddings] Indexing ${bibleId} failed:`, err)
            return false
        } finally {
            if (this.indexingBibleId === bibleId) this.indexingBibleId = ""
        }
    }

    async query(text: string, bibleId: string, topK = 3): Promise<EmbeddingCandidate[]> {
        if (!text.trim() || !(await this.ensureLoaded())) return []
        if (!this.loadVectors(bibleId) || !this.loadedMatrix) return []

        const [question] = await this.embed([text])
        const count = this.loadedRefs.length
        const scored: EmbeddingCandidate[] = []
        for (let i = 0; i < count; i++) {
            let score = 0
            const offset = i * this.dims
            for (let j = 0; j < this.dims; j++) score += question[j] * this.loadedMatrix[offset + j]
            scored.push({ ref: this.loadedRefs[i], score })
        }
        scored.sort((a, b) => b.score - a.score)
        return scored.slice(0, topK)
    }
}

export const embeddingEngine = new EmbeddingEngine()
