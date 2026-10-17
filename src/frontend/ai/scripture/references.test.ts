import { describe, expect, it } from "vitest"
import type { BibleCacheData } from "./BibleCacheManager"
import { normalizeNumbers } from "./numbers"
import { normalizeReferences } from "./references"

const mockCacheData: BibleCacheData = {
    versePool: [],
    verseToIdMap: new Map(),
    referenceIndex: new Map([
        ["jean 3", { bookName: "Jean", chapterNumber: 3, startVerseId: 0, verseCount: 36 }],
        ["jean 4", { bookName: "Jean", chapterNumber: 4, startVerseId: 36, verseCount: 54 }],
        ["romains 8", { bookName: "Romains", chapterNumber: 8, startVerseId: 90, verseCount: 39 }],
        ["juan 3", { bookName: "Juan", chapterNumber: 3, startVerseId: 129, verseCount: 36 }],
        ["johannes 3", { bookName: "Johannes", chapterNumber: 3, startVerseId: 165, verseCount: 36 }],
        ["john 3", { bookName: "John", chapterNumber: 3, startVerseId: 201, verseCount: 36 }],
        ["1 jean 1", { bookName: "1 Jean", chapterNumber: 1, startVerseId: 237, verseCount: 10 }],
        ["1 johannes 1", { bookName: "1 Johannes", chapterNumber: 1, startVerseId: 247, verseCount: 10 }],
        // Zulu
        ["johane 3", { bookName: "Johane", chapterNumber: 3, startVerseId: 257, verseCount: 36 }],
        ["izihlabelelo 23", { bookName: "Izihlabelelo", chapterNumber: 23, startVerseId: 293, verseCount: 6 }],
        ["eseyaya 53", { bookName: "Eseyaya", chapterNumber: 53, startVerseId: 299, verseCount: 12 }]
    ]),
    vocabPool: [],
    vocabToIdMap: new Map(),
    wordIdf: new Float32Array(),
    wordPostingsOffsets: new Uint32Array(),
    wordPostings: new Uint32Array(),
    verseTokensOffsets: new Uint32Array(),
    verseTokens: new Uint32Array(),
    bookNames: ["Jean", "Romains", "Juan", "Johannes", "John", "1 Jean", "1 Johannes", "Johane", "Izihlabelelo", "Eseyaya"],
    refRegex: null,
    totalVerses: 320
}

describe("normalizeReferences - Multilingual", () => {
    it("normalizes spoken French references", () => {
        // "Jean chapitre trois verset seize"
        const numbersNormalized = normalizeNumbers("Jean chapitre trois verset seize")
        expect(numbersNormalized).toBe("jean chapitre 3 verset 16")
        expect(normalizeReferences(numbersNormalized, mockCacheData)).toBe("jean 3:16")

        // "Jean 3 verset 16"
        expect(normalizeReferences("Jean 3 verset 16", mockCacheData)).toBe("Jean 3:16")

        // "Jean 3 et 16"
        expect(normalizeReferences("Jean 3 et 16", mockCacheData)).toBe("Jean 3:16")

        // "verset 16 de Jean chapitre 3"
        expect(normalizeReferences("verset 16 de Jean chapitre 3", mockCacheData)).toBe("Jean 3:16")

        // "Jean 3 16"
        expect(normalizeReferences("Jean 3 16", mockCacheData)).toBe("Jean 3:16")

        // "le huitième chapitre de Romains"
        const numNormOrdinal = normalizeNumbers("le huitième chapitre de Romains")
        expect(normalizeReferences(numNormOrdinal, mockCacheData)).toBe("romains 8")

        // "1er Jean 1:4"
        expect(normalizeReferences("premier, Jean 1:4", mockCacheData)).toBe("1 Jean 1:4")
    })

    it("normalizes spoken Spanish references", () => {
        // "Juan capítulo 3 versículo 16"
        const numNorm = normalizeNumbers("Juan capítulo tres versículo dieciséis")
        expect(numNorm).toBe("juan capítulo 3 versículo 16")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("juan 3:16")

        // "versículo 16 de Juan capítulo 3"
        expect(normalizeReferences("versículo 16 de Juan capítulo 3", mockCacheData)).toBe("Juan 3:16")
    })

    it("normalizes spoken German references", () => {
        // "Johannes Kapitel 3 Vers 16"
        const numNorm = normalizeNumbers("Johannes Kapitel drei Vers sechzehn")
        expect(numNorm).toBe("johannes kapitel 3 vers 16")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("johannes 3:16")
    })

    it("normalizes spoken English references", () => {
        // "John chapter 3 verse 16"
        const numNorm = normalizeNumbers("John chapter three verse sixteen")
        expect(numNorm).toBe("john chapter 3 verse 16")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("john 3:16")
    })

    it("normalizes spoken Norwegian references", () => {
        // "Johannes kapittel tre vers seksten"
        const numNorm = normalizeNumbers("Johannes kapittel tre vers seksten")
        expect(numNorm).toBe("johannes kapittel 3 vers 16")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("johannes 3:16")

        // "vers 16 av Johannes kapittel 3"
        expect(normalizeReferences("vers 16 av Johannes kapittel 3", mockCacheData)).toBe("Johannes 3:16")

        // "Johannes 3 og 16"
        expect(normalizeReferences("Johannes 3 og 16", mockCacheData)).toBe("Johannes 3:16")

        // "Første Johannes 1:4"
        expect(normalizeReferences("Første Johannes 1:4", mockCacheData)).toBe("1 Johannes 1:4")
    })
})

describe("normalizeReferences - Zulu (isiZulu)", () => {
    // mixed speech as the recognizer might hear it
    it("parses 'Johane 3 ivesi 16'", () => {
        expect(normalizeReferences("Johane 3 ivesi 16", mockCacheData)).toBe("Johane 3:16")
    })

    it("parses chapter and verse words with digits", () => {
        expect(normalizeReferences("Johane isahluko 3 ivesi 16", mockCacheData)).toBe("Johane 3:16")
        // common mishearing of isahluko
        expect(normalizeReferences("ujohane isahluku 3 ivesi 16", mockCacheData)).toBe("johane 3:16")
    })

    it("strips noun-class prefixes glued to book names", () => {
        expect(normalizeReferences("uJohane 3 ivesi 16", mockCacheData)).toBe("Johane 3:16")
        expect(normalizeReferences("kwaJohane isahluko 3 ivesi 16", mockCacheData)).toBe("Johane 3:16")

        const numNorm = normalizeNumbers("eEseyaya amashumi amahlanu nesithathu ivesi")
        expect(numNorm).toBe("eeseyaya 53 ivesi")
        expect(normalizeReferences(numNorm, mockCacheData)).toContain("eseyaya 53")
    })

    it("converts spoken Zulu numbers in references", () => {
        // "Johane isahluko sesithathu ivesi yishumi nesithupha" style speech:
        // chapter three, verse sixteen
        const numNorm = normalizeNumbers("ujohane isahluko sesithathu ivesi ishumi nesithupha")
        expect(numNorm).toBe("ujohane isahluko 3 ivesi 16")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("johane 3:16")
    })

    it("converts tens compounds in references", () => {
        // Izihlabelelo (Psalms) chapter 23, verse "amashumi amabili nesithupha" (26)
        const numNorm = normalizeNumbers("izihlabelelo 23 ivesi amashumi amabili nesithupha")
        expect(numNorm).toBe("izihlabelelo 23 ivesi 26")
        expect(normalizeReferences(numNorm, mockCacheData)).toBe("izihlabelelo 23:26")
    })

    it("parses Eseyaya (Isaiah) fifty three", () => {
        const numNorm = normalizeNumbers("eseyaya amashumi amahlanu nesithathu")
        expect(numNorm).toBe("eseyaya 53")
    })
})
