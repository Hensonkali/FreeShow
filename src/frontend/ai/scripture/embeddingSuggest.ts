import type { EmbeddingCandidate, MatchResult } from "../../../types/ai/Ai"
import { get } from "svelte/store"
import { ai } from "../../stores.ts"

// Embedding matches catch synonym-heavy paraphrases that word matching misses.
// High scores (>= 0.75) follow the normal auto-present gates (confidence floor,
// user setting, cooldowns); lower scores stay suggestion-only. A clear winner
// is required either way.
export const EMBED_MIN_SCORE = 0.6
export const EMBED_AUTO_SCORE = 0.75
export const EMBED_MIN_GAP = 0.05

export function selectEmbeddingSuggestion(results: EmbeddingCandidate[], bibleId: string): MatchResult | null {
    if (!results?.length) return null

    const [first, second] = [...results].sort((a, b) => b.score - a.score)
    if (first.score < EMBED_MIN_SCORE) return null
    if (second && first.score - second.score < EMBED_MIN_GAP) return null

    // boost confidence for service passages
    let boostedConfidence = Math.round(first.score * 100)
    const servicePassages = get(ai)?.servicePassages || []
    if (servicePassages.includes(first.ref)) {
        boostedConfidence = Math.min(100, boostedConfidence + 15)
    }

    return {
        type: "scripture",
        content: first.ref,
        confidence: boostedConfidence,
        detector: "embedding",
        scriptureMatchType: "content",
        // below the auto threshold it may only ever be a suggestion
        suggestOnly: boostedConfidence < EMBED_AUTO_SCORE * 100,
        scriptureTranslation: bibleId
    }
}
