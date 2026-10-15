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
    detector?: "reference" | "standalone_verse" | "next_verse" | "content" | "version" | "llm"

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
