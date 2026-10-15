export type AIProviderId = "ollama" | "anthropic" | "openai" | "google"
export type AiFeatureState = "starting" | "listening" | "stopped" | "error" | "llm_paused"

export interface AiFeatureStatus {
    state: AiFeatureState
    message?: string
    keyless?: boolean
}

export interface MatchResult {
    type: "scripture" | "scripture_version" | "lyrics" | "quote" | "announcement" | "empty"
    content: string // "scripture" = reference (e.g., "Genesis 1:1")
    confidence: number // 1-100
    // which detector produced this match (for the debug/test panel)
    detector?: "reference" | "standalone_verse" | "next_verse" | "content" | "version" | "llm" | "embedding"
    // true = suggestion only, never auto-display (e.g. embedding paraphrase matches)
    suggestOnly?: boolean

    scriptureMatchType?: "content"
    scriptureTranslation?: string
    scriptureIsNewTranslation?: boolean
}

export interface AiSuggestion {
    id: string
    action: string
    content: string
    timestamp: number
    confidence: number
    trigger?: () => void

    scriptureTranslation?: string
}

// decision log (Step 7: every AI detection decision is appended to a local file)

export type AiDecisionAction = "presented" | "suggested" | "suppressed" | "override_presented" | "override_opened" | "dismissed" | "cleared"

export interface AiDecisionLog {
    t: number // timestamp
    heard: string // transcript chunk that was analyzed
    detector?: MatchResult["detector"]
    ref?: string // verse reference, if any
    confidence?: number
    translation?: string
    action: AiDecisionAction
    reason?: string // why suppressed, or which gate passed
}

// verse embedding search (local onnx model, CPU only)

export interface EmbeddingCandidate {
    ref: string // canonical reference, e.g. "John 3:16"
    score: number // cosine similarity 0-1
}

export interface EmbeddingQueryResult {
    modelReady: boolean
    indexed: number
    total: number
    results: EmbeddingCandidate[]
}

// models

export interface EngineStatus {
    ready: boolean
    error?: string
    // machine-readable cause when not ready (missing = nothing downloaded yet,
    // outdated = files changed upstream, unsupported = this device can't run it)
    reason?: "missing" | "outdated" | "unsupported"

    localPath?: string | null
    downloadedModels?: string[]
}

export interface AiSetupOptions {
    action: "download" | "cancel" | "delete" | "verify"
    engineId: string
    modelId?: string
    customPath?: string
}

export interface LLMCompletionOptions {
    systemPrompt?: string
    prompt: string
    jsonSchema?: any
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
}
