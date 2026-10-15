import { describe, expect, it } from "vitest"
import { buildVocab, cosineSimilarity, encode, meanPool, padBatch, tokenize, wordpieceTokenizeWord } from "./wordpiece"

// tiny BERT-style vocab, ids mirror bert-base-uncased for the specials
const vocab = buildVocab({ "[PAD]": 0, "[UNK]": 100, "[CLS]": 101, "[SEP]": 102, "[MASK]": 103, god: 1, love: 3, "##d": 4, world: 5, john: 6, the: 7 })

describe("wordpiece", () => {
    it("tokenizes whole known words", () => {
        expect(tokenize("god love the world", vocab)).toEqual([1, 3, 7, 5])
    })

    it("lowercases and splits punctuation", () => {
        expect(tokenize("God, love!", vocab)).toEqual([1, 100, 3, 100])
    })

    it("splits unknown words into known pieces", () => {
        expect(wordpieceTokenizeWord("loved", vocab)).toEqual([3, 4])
    })

    it("falls back to [UNK] for unsplittable words", () => {
        expect(tokenize("xyzzy", vocab)).toEqual([100])
        expect(tokenize("a".repeat(250), vocab)).toEqual([100])
    })

    it("encodes with CLS/SEP and mask", () => {
        const encoded = encode("god loved", vocab)
        expect(encoded.inputIds).toEqual([101, 1, 3, 4, 102])
        expect(encoded.attentionMask).toEqual([1, 1, 1, 1, 1])
    })

    it("pads batches to equal length", () => {
        const batch = padBatch([encode("god", vocab), encode("god love the world", vocab)], vocab.padId)
        expect(batch.inputIds[0]).toEqual([101, 1, 102, 0, 0, 0])
        expect(batch.attentionMask[0]).toEqual([1, 1, 1, 0, 0, 0])
        expect(batch.inputIds[1].length).toBe(6)
    })
})

describe("meanPool", () => {
    it("averages masked positions and L2-normalizes", () => {
        // 3 tokens x 2 dims, mask skips the middle token
        const hidden = new Float32Array([3, 0, 99, 99, 0, 4])
        const pooled = meanPool(hidden, 3, 2, [1, 0, 1])
        // mean of [3,0] and [0,4] = [1.5,2], norm = 2.5
        expect(pooled[0]).toBeCloseTo(0.6, 5)
        expect(pooled[1]).toBeCloseTo(0.8, 5)
    })
})

describe("cosineSimilarity", () => {
    it("is 1 for identical vectors and 0 for orthogonal ones", () => {
        expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1, 5)
        expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 5)
    })
})
