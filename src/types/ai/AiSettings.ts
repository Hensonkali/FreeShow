export interface AiSettings {
    enabled?: boolean
    stt?: SttSettings
    llm?: LlmSettings

    // shadow mode: detect and log, but never display anything on the output
    shadowMode?: boolean

    // lock output: detect and log, but never auto-present or allow voice commands to change output
    lockOutput?: boolean

    // paraphrase search with the local embedding model (disable on very small machines)
    paraphraseSearch?: boolean

    // which detection features are enabled (disable heavy ones on small machines)
    features?: {
        reference?: boolean   // exact reference detection
        content?: boolean     // TF-IDF content matching
        embedding?: boolean   // semantic paraphrase matching (heaviest)
        llm?: boolean         // cloud LLM detection
        voice?: boolean       // voice command processing
    }

    scripture?: AiScriptureSettings
}

interface SttSettings {
    // enabled?: boolean
    micDeviceId?: string

    engine?: string
    // download missing speech models automatically in the background (default true)
    autoDownloadModels?: boolean
    // per-engine options
    engineOptions?: {
        [key: string]: SttEngineOptions
    }
}

export interface SttEngineOptions {
    customPath?: string

    language?: string // transcription language
    model?: string
    customModelPath?: string

    // WIP interpretationMode
    interpretationMode?: boolean
    listenLanguage?: string
    spokenLanguages?: string[]
}

interface LlmSettings {
    provider?: string
    model?: string
}

export type ConfidenceLevels = "ask" | "highest" | "high" | "medium"
interface AiScriptureSettings {
    confidence?: ConfidenceLevels
}
