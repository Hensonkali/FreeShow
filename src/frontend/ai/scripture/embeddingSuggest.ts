import type { EmbeddingCandidate, MatchResult } from "../../../types/ai/Ai"

// Embedding matches are suggestions only: they catch synonym-heavy
// paraphrases that word matching misses, so they need a clear winner.
export const EMBED_MIN_SCORE = 0.6
export const EMBED_MIN_GAP = 0.05

export function selectEmbeddingSuggestion(results: EmbeddingCandidate[], bibleId: string): MatchResult | null {
    if (!results?.length) return null

    const [first, second] = [...results].sort((a, b) => b.score - a.score)
    if (first.score < EMBED_MIN_SCORE) return null
    if (second && first.score - second.score < EMBED_MIN_GAP) return null

    return {
        type: "scripture",
        content: first.ref,
        confidence: Math.round(first.score * 100),
        detector: "embedding",
        scriptureMatchType: "content",
        suggestOnly: true,
        scriptureTranslation: bibleId
    }
}
