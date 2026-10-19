import { describe, expect, it } from "vitest"
import { EMBED_MIN_GAP, EMBED_MIN_SCORE, selectEmbeddingSuggestion } from "./embeddingSuggest"

describe("selectEmbeddingSuggestion", () => {
    it("accepts a clear winner above the floor", () => {
        const match = selectEmbeddingSuggestion(
            [
                { ref: "John 3:16", score: 0.774 },
                { ref: "John 3:17", score: 0.681 },
                { ref: "Genesis 1:1", score: 0.414 }
            ],
            "kjv"
        )
        expect(match?.content).toBe("John 3:16")
        expect(match?.detector).toBe("embedding")
        expect(match?.confidence).toBe(77)
        // 0.774 is above the auto-present line, so it is not suggestion-locked
        expect(match?.suggestOnly).toBeFalsy()
    })

    it("rejects a winner below the score floor", () => {
        expect(
            selectEmbeddingSuggestion(
                [
                    { ref: "Proverbs 3:5", score: 0.382 },
                    { ref: "Psalm 23:1", score: 0.3 }
                ],
                "kjv"
            )
        ).toBeNull()
    })

    it("rejects a winner without a clear gap to second place", () => {
        expect(
            selectEmbeddingSuggestion(
                [
                    { ref: "John 3:16", score: 0.7 },
                    { ref: "John 3:17", score: 0.7 - EMBED_MIN_GAP + 0.001 }
                ],
                "kjv"
            )
        ).toBeNull()
    })

    it("accepts a lone candidate above the floor", () => {
        expect(selectEmbeddingSuggestion([{ ref: "Genesis 1:1", score: EMBED_MIN_SCORE }], "kjv")?.content).toBe("Genesis 1:1")
    })

    it("high scores are auto-present eligible, lower scores stay suggestion-only", () => {
        const high = selectEmbeddingSuggestion([{ ref: "John 3:16", score: 0.875 }, { ref: "John 3:17", score: 0.4 }], "kjv")
        expect(high?.suggestOnly).toBeFalsy()
        expect(high?.confidence).toBe(88)

        const medium = selectEmbeddingSuggestion([{ ref: "John 3:16", score: 0.65 }, { ref: "John 3:17", score: 0.2 }], "kjv")
        expect(medium?.suggestOnly).toBe(true)
    })

    it("rejects empty results", () => {
        expect(selectEmbeddingSuggestion([], "kjv")).toBeNull()
    })

    it("sorts unsorted input before deciding", () => {
        const match = selectEmbeddingSuggestion(
            [
                { ref: "John 3:17", score: 0.5 },
                { ref: "Genesis 1:1", score: 0.875 },
                { ref: "John 3:16", score: 0.498 }
            ],
            "kjv"
        )
        expect(match?.content).toBe("Genesis 1:1")
    })
})
