import { describe, expect, it } from "vitest"
import type { BibleCacheData } from "./BibleCacheManager"
import { BibleSearchDetector } from "./BibleSearchDetector"
import { charGrams, isZuluBible } from "./ngrams"
import { CHAPTER_PATTERN, ORDINAL_PREFIX_PATTERN, VERSE_PATTERN } from "./referenceDictionary"

// Verse texts below are from the World English Bible (public domain),
// shortened to the verses this test needs.
interface TestVerse {
    book: string
    chapter: number
    verse: number
    text: string
}

const TEST_VERSES: TestVerse[] = [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
    { book: "Psalm", chapter: 23, verse: 1, text: "Yahweh is my shepherd; I shall lack nothing." },
    { book: "Proverbs", chapter: 3, verse: 5, text: "Trust in Yahweh with all your heart, and don't lean on your own understanding." },
    { book: "John", chapter: 1, verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life." },
    { book: "John", chapter: 3, verse: 17, text: "For God didn't send his Son into the world to judge the world, but that the world should be saved through him." },
    { book: "Romans", chapter: 8, verse: 28, text: "We know that all things work together for good for those who love God, for those who are called according to his purpose." },
    { book: "Philippians", chapter: 4, verse: 13, text: "I can do all things through Christ, who strengthens me." }
]

function tokenizeText(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/['’`\-_]/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((w) => w.length > 1)
}

// real chapter lengths: the detector validates verse numbers against
// verseCount, so the miniature index must carry the true sizes
const CHAPTER_SIZES: Record<string, number> = { "genesis 1": 31, "psalm 23": 6, "proverbs 3": 35, "john 1": 51, "john 3": 36, "romans 8": 39, "philippians 4": 23, "johane 3": 36, "izihlabelelo 23": 6, "eseyaya 53": 12 }
function buildTestCache(verses: TestVerse[], ngram = false): BibleCacheData {
    const tokenize = ngram ? (text: string) => charGrams(text) : (text: string) => tokenizeText(text)
    const versePool: string[] = []
    const verseToIdMap = new Map<string, number>()
    const referenceIndex = new Map<string, { bookName: string; chapterNumber: number; startVerseId: number; verseCount: number }>()
    const vocabPool: string[] = []
    const vocabToIdMap = new Map<string, number>()
    const tempPostings = new Map<number, number[]>()
    const tempVerseTokens: number[][] = []
    const bookNames: string[] = []

    verses.forEach((item, verseId) => {
        if (!bookNames.includes(item.book)) bookNames.push(item.book)

        const ref = `${item.book} ${item.chapter}:${item.verse}`
        versePool.push(ref)
        verseToIdMap.set(ref.toLowerCase(), verseId)

        const refKey = `${item.book.toLowerCase()} ${item.chapter}`
        if (!referenceIndex.has(refKey)) {
            referenceIndex.set(refKey, { bookName: item.book, chapterNumber: item.chapter, startVerseId: verseId, verseCount: CHAPTER_SIZES[refKey] ?? 1 })
        }

        const unique = [
            ...new Set(
                tokenize(item.text).map((word) => {
                    let wordId = vocabToIdMap.get(word)
                    if (wordId === undefined) {
                        wordId = vocabPool.length
                        vocabToIdMap.set(word, wordId)
                        vocabPool.push(word)
                    }
                    return wordId
                })
            )
        ].sort((a, b) => a - b)
        tempVerseTokens.push(unique)
        for (const wordId of unique) {
            const list = tempPostings.get(wordId) || []
            list.push(verseId)
            tempPostings.set(wordId, list)
        }
    })

    const totalVerses = verses.length
    const vocabSize = vocabPool.length
    const wordIdf = new Float32Array(vocabSize)
    const wordPostingsOffsets = new Uint32Array(vocabSize + 1)
    let totalPostings = 0
    for (let wordId = 0; wordId < vocabSize; wordId++) {
        const list = tempPostings.get(wordId) || []
        wordPostingsOffsets[wordId] = totalPostings
        totalPostings += list.length
        wordIdf[wordId] = Math.log((totalVerses + 1) / (list.length + 1))
    }
    wordPostingsOffsets[vocabSize] = totalPostings
    const wordPostings = new Uint32Array(totalPostings)
    for (let wordId = 0; wordId < vocabSize; wordId++) {
        wordPostings.set(tempPostings.get(wordId) || [], wordPostingsOffsets[wordId])
    }

    const verseTokensOffsets = new Uint32Array(totalVerses + 1)
    let totalTokens = 0
    for (let verseId = 0; verseId < totalVerses; verseId++) {
        verseTokensOffsets[verseId] = totalTokens
        totalTokens += tempVerseTokens[verseId].length
    }
    verseTokensOffsets[totalVerses] = totalTokens
    const verseTokens = new Uint32Array(totalTokens)
    for (let verseId = 0; verseId < totalVerses; verseId++) {
        verseTokens.set(tempVerseTokens[verseId], verseTokensOffsets[verseId])
    }

    const bookPattern = bookNames.map((b) => b.replace(/\s+/g, "\\s+")).join("|")
    const refRegex = new RegExp(`\\b((?:(?:[1-3]|${ORDINAL_PREFIX_PATTERN})\\s+)?(?:${bookPattern}))\\b\\s*(?:${CHAPTER_PATTERN})?\\s*(\\d+)(?:[\\s,:.]+(?:${VERSE_PATTERN})?\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?)?`, "iu")

    return { versePool, verseToIdMap, referenceIndex, vocabPool, vocabToIdMap, wordIdf, wordPostingsOffsets, wordPostings, verseTokensOffsets, verseTokens, bookNames, refRegex, totalVerses, ngram }
}

const detector = new BibleSearchDetector(buildTestCache(TEST_VERSES))

describe("scripture detector - exact references", () => {
    it("detects a plain reference", async () => {
        const match = await detector.search("John 3:16", "")
        expect(match?.detector).toBe("reference")
        expect(match?.content).toBe("John 3:16")
        expect(match?.confidence).toBe(98)
    })

    it("detects a spoken reference", async () => {
        const match = await detector.search("as it says in john chapter three verse sixteen", "")
        expect(match?.detector).toBe("reference")
        expect(match?.content).toBe("John 3:16")
        expect(match?.confidence).toBe(98)
    })

    it("detects a chapter-only reference", async () => {
        const match = await detector.search("let's open genesis chapter one", "")
        expect(match?.detector).toBe("reference")
        expect(match?.content).toBe("Genesis 1:1")
        expect(match?.confidence).toBe(75)
    })
})

describe("scripture detector - quotes", () => {
    it("detects a direct quote", async () => {
        const match = await detector.search("for God so loved the world that he gave his one and only son that whoever believes in him should not perish but have eternal life", "")
        expect(match?.detector).toBe("content")
        expect(match?.content).toBe("John 3:16")
        expect(match?.confidence).toBeGreaterThanOrEqual(70)
    })

    it("detects a quote from another passage", async () => {
        const match = await detector.search("yahweh is my shepherd i shall lack nothing", "")
        expect(match?.content).toBe("Psalm 23:1")
    })
})

describe("scripture detector - paraphrases", () => {
    it("detects a paraphrase as a suggestion-level content match", async () => {
        const match = await detector.search("God loved the world so much that he gave his son for us", "")
        expect(match?.detector).toBe("content")
        expect(match?.content).toBe("John 3:16")
    })
})

describe("scripture detector - standalone verses", () => {
    it("resolves a bare verse against the displayed reference", async () => {
        const match = await detector.search("verse 17", "John 3:16")
        expect(match?.detector).toBe("standalone_verse")
        expect(match?.content).toBe("John 3:17")
    })
})

describe("scripture detector - no match", () => {
    it("returns null for everyday speech", async () => {
        expect(await detector.search("the weather today is sunny and warm outside", "")).toBeNull()
    })

    it("returns null for an unknown book", async () => {
        expect(await detector.search("hezekiah chapter four verse two", "")).toBeNull()
    })
})

describe("scripture detector - Zulu n-gram matching", () => {
    // synthetic agglutinative text: words share stems but change shape,
    // which is exactly where whole-word matching fails
    const zuluVerses: TestVerse[] = [
        { book: "Johane", chapter: 3, verse: 16, text: "ngokuba unkulunkulu uthanda izwe" },
        { book: "Izihlabelelo", chapter: 23, verse: 1, text: "unkulunkulu uyisigodi wami angeke ngingathwali" },
        { book: "Eseyaya", chapter: 53, verse: 5, text: "waphangwa ngenxa yokuhlukumezeka kwethu" }
    ]
    const zuluDetector = new BibleSearchDetector(buildTestCache(zuluVerses, true))

    it("matches a paraphrase whose word forms differ from the verse", async () => {
        // "ukuthanda" (loving) vs the verse's "uthanda" (loves): same stem, different shape
        const match = await zuluDetector.search("unkulunkulu ukuthanda izwe", "")
        expect(match?.content).toBe("Johane 3:16")
        expect(match?.scriptureMatchType).toBe("content")
    })

    it("still detects explicit Zulu references", async () => {
        const match = await zuluDetector.search("johane isahluko 3 ivesi 16", "")
        expect(match?.detector).toBe("reference")
        expect(match?.content).toBe("Johane 3:16")
    })
})

describe("ngram helpers", () => {
    it("cuts 4-character grams", () => {
        expect(charGrams("Johane")).toEqual(["joha", "ohan", "hane"])
        expect(charGrams("iz", 4)).toEqual([])
        // punctuation is dropped, words are joined by single spaces
        expect(charGrams("Ngi-ya! ba~thanda", 4).slice(0, 3)).toEqual(["ngiy", "giya", "iya "])
    })

    it("detects Zulu Bibles by name", () => {
        expect(isZuluBible("Zulu Bible")).toBe(true)
        expect(isZuluBible(undefined, "isiZulu 1924")).toBe(true)
        expect(isZuluBible("King James Version", "KJV")).toBe(false)
    })
})
