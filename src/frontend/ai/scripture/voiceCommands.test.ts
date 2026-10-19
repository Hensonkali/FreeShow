import { describe, expect, it } from "vitest"
import { detectVoiceCommand, navFromReference, type InstalledTranslation } from "./voiceCommands"

const installed: InstalledTranslation[] = [
    { id: "a.bbe", name: "Bible in Basic English" },
    { id: "a.kjv", name: "King James Version", customName: "KJV (King James Version)" },
    { id: "zulu.1", name: "Zulu Bible" }
]

describe("detectVoiceCommand - navigation", () => {
    it("recognizes next verse", () => {
        expect(detectVoiceCommand("next verse", installed)).toEqual({ command: "next_verse" })
        expect(detectVoiceCommand("go to the next verse please", installed)).toEqual({ command: "next_verse" })
        expect(detectVoiceCommand("next one", installed)).toEqual({ command: "next_verse" })
    })

    it("recognizes previous verse", () => {
        expect(detectVoiceCommand("previous verse", installed)).toEqual({ command: "previous_verse" })
        expect(detectVoiceCommand("can you go back a verse", installed)).toEqual({ command: "previous_verse" })
        expect(detectVoiceCommand("last verse", installed)).toEqual({ command: "previous_verse" })
    })

    it("ignores normal speech", () => {
        expect(detectVoiceCommand("and then he said to them", installed)).toBeNull()
        expect(detectVoiceCommand("the next chapter is about love", installed)).toBeNull()
    })
})

describe("detectVoiceCommand - translations", () => {
    it("executes an installed translation by short name", () => {
        expect(detectVoiceCommand("give me KJV", installed)).toEqual({ command: "translation", translationId: "a.kjv", name: "KJV (King James Version)" })
    })

    it("executes an installed translation by full name", () => {
        expect(detectVoiceCommand("switch to the King James Version", installed)).toEqual({ command: "translation", translationId: "a.kjv", name: "KJV (King James Version)" })
        expect(detectVoiceCommand("give me the bible in basic english", installed)).toEqual({ command: "translation", translationId: "a.bbe", name: "Bible in Basic English" })
    })

    it("understands 'show this in X' phrasing", () => {
        expect(detectVoiceCommand("show this in Zulu", installed)).toEqual({ command: "translation", translationId: "zulu.1", name: "Zulu Bible" })
        expect(detectVoiceCommand("show it in the Zulu Bible", installed)).toEqual({ command: "translation", translationId: "zulu.1", name: "Zulu Bible" })
        expect(detectVoiceCommand("can we have that in Zulu", installed)).toEqual({ command: "translation", translationId: "zulu.1", name: "Zulu Bible" })
    })

    it("matches a bible by partial name ('move it to Amplified' -> 'Amplified Bible')", () => {
        const withAmplified: InstalledTranslation[] = [...installed, { id: "a.amp", name: "Amplified Bible" }]
        expect(detectVoiceCommand("move it to Amplified", withAmplified)).toEqual({ command: "translation", translationId: "a.amp", name: "Amplified Bible" })
        expect(detectVoiceCommand("switch to Amplified", withAmplified)).toEqual({ command: "translation", translationId: "a.amp", name: "Amplified Bible" })
        expect(detectVoiceCommand("give me the Amplified", withAmplified)).toEqual({ command: "translation", translationId: "a.amp", name: "Amplified Bible" })
    })

    it("survives mishearings with fuzzy word matching", () => {
        const withAmplified: InstalledTranslation[] = [...installed, { id: "a.amp", name: "Amplified Bible" }]
        expect(detectVoiceCommand("switch to Amplifide", withAmplified)).toEqual({ command: "translation", translationId: "a.amp", name: "Amplified Bible" })
    })

    it("reports a missing known translation instead of showing a wrong verse", () => {
        expect(detectVoiceCommand("give me NLT", installed)).toEqual({ command: "translation_missing", name: "NLT" })
        expect(detectVoiceCommand("can you give me the ESV please", installed)).toEqual({ command: "translation_missing", name: "ESV" })
        expect(detectVoiceCommand("switch to the New International Version", installed)).toEqual({ command: "translation_missing", name: "NIV" })
        expect(detectVoiceCommand("put the NLT on screen", installed)).toEqual({ command: "translation_missing", name: "NLT" })
        expect(detectVoiceCommand("show this in NIV", installed)).toEqual({ command: "translation_missing", name: "NIV" })
    })

    it("returns null for unknown requested names", () => {
        expect(detectVoiceCommand("give me the orange book", installed)).toBeNull()
    })

    it("prefers navigation over translation phrasing", () => {
        expect(detectVoiceCommand("give me the next verse", installed)).toEqual({ command: "next_verse" })
    })
})

describe("navFromReference", () => {
    it("moves within a chapter", () => {
        expect(navFromReference("John 3:16", 36, 1)).toEqual({ next: "John 3:17", nextVerse: 17 })
        expect(navFromReference("John 3:16", 36, -1)).toEqual({ next: "John 3:15", nextVerse: 15 })
    })

    it("stops at the verse range edges", () => {
        expect(navFromReference("John 3:36", 36, 1)).toBeNull()
        expect(navFromReference("John 3:1", 36, -1)).toBeNull()
    })

    it("ignores verse ranges", () => {
        expect(navFromReference("John 3:16-18", 36, 1)).toEqual({ next: "John 3:17", nextVerse: 17 })
    })

    it("rejects malformed references", () => {
        expect(navFromReference("Psalm 23", 6, 1)).toBeNull()
    })
})
