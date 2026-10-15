import type { EmbeddingQueryResult } from "../../../types/ai/Ai"
import { ToMain } from "../../../types/IPC/ToMain"
import { sendToMain } from "../../IPC/main"
import { embeddingEngine, extractVerses } from "./embeddings"
import { EmbeddingSetupManager } from "./embeddingSetup"

const INDEX_PROGRESS_KEY = "embeddings-index"

function indexProgress(indexed: number, total: number, status: "downloading" | "complete" | "error" = "downloading") {
    sendToMain(ToMain.MEDIA_DOWNLOAD_PROGRESS, { url: INDEX_PROGRESS_KEY, name: "Verse vectors", progress: indexed, total, status })
}

export async function embedStatus(data?: { bibleId?: string; name?: string }): Promise<{ modelReady: boolean; indexed: number; total: number }> {
    const modelReady = EmbeddingSetupManager.isModelReady()
    if (!modelReady || !data?.bibleId) return { modelReady, indexed: 0, total: 0 }

    const status = embeddingEngine.getIndexStatus(data.bibleId)
    if (status.indexed > 0) return { modelReady, ...status }

    return { modelReady, indexed: 0, total: countVerses(data) }
}

export async function embedQuery(data: { text: string; bibleId: string; name: string; topK?: number }): Promise<EmbeddingQueryResult> {
    const modelReady = EmbeddingSetupManager.isModelReady()
    const status = modelReady ? embeddingEngine.getIndexStatus(data.bibleId) : { indexed: 0, total: 0 }
    const total = status.indexed > 0 ? status.total : countVerses(data)

    if (!modelReady || status.indexed === 0) {
        // index in the background so the next chunk can use vectors
        if (modelReady && !embeddingEngine.isIndexing()) void embedIndex(data)
        return { modelReady, indexed: status.indexed, total, results: [] }
    }

    const results = await embeddingEngine.query(data.text, data.bibleId, data.topK ?? 3)
    return { modelReady: true, indexed: status.indexed, total: status.total, results }
}

export async function embedIndex(data: { bibleId: string; name: string }): Promise<boolean> {
    if (embeddingEngine.isIndexing()) return false
    if (!EmbeddingSetupManager.isModelReady()) return false

    // lazy require avoids a main-process import cycle (responsesMain owns the bible loader)
    const { loadScripture } = require("../../IPC/responsesMain")
    const bible = loadScripture({ id: data.bibleId, name: data.name })
    const verses = extractVerses(bible?.content)
    if (!verses.length) return false

    indexProgress(0, verses.length)
    const ok = await embeddingEngine.indexBible(data.bibleId, verses, (indexed, total) => indexProgress(indexed, total))
    indexProgress(verses.length, verses.length, ok ? "complete" : "error")
    return ok
}

export function embedDownload(): Promise<boolean> {
    return EmbeddingSetupManager.downloadModel()
}

function countVerses(data: { bibleId?: string; name?: string }): number {
    if (!data?.bibleId || !data?.name) return 0
    try {
        const { loadScripture } = require("../../IPC/responsesMain")
        return extractVerses(loadScripture({ id: data.bibleId, name: data.name })?.content).length
    } catch {
        return 0
    }
}
