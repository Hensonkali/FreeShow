// Voice commands ("next verse", "give me NLT") — explicit operator intent,
// so they execute immediately instead of becoming suggestions.

export interface InstalledTranslation {
    id: string
    name?: string
    customName?: string
}

export type VoiceCommand = { command: "next_verse" } | { command: "previous_verse" } | { command: "translation"; translationId: string; name: string } | { command: "translation_missing"; name: string }

// common English translation names people say, mapped to the short name
// used in messages; used to recognize requests for translations that are
// not installed (so we can say so on screen instead of showing a wrong verse)
export const KNOWN_TRANSLATION_ALIASES: Record<string, string> = {
    nlt: "NLT",
    "new living translation": "NLT",
    "new living": "NLT",
    esv: "ESV",
    "english standard version": "ESV",
    "english standard": "ESV",
    niv: "NIV",
    "new international version": "NIV",
    "new international": "NIV",
    nirv: "NIRV",
    kjv: "KJV",
    "king james": "KJV",
    "king james version": "KJV",
    nkjv: "NKJV",
    "new king james": "NKJV",
    "new king james version": "NKJV",
    nasb: "NASB",
    "new american standard": "NASB",
    ncv: "NCV",
    "new century version": "NCV",
    cev: "CEV",
    "contemporary english version": "CEV",
    "contemporary english": "CEV",
    amp: "AMP",
    "amplified bible": "AMP",
    "amplified version": "AMP",
    amplified: "AMP",
    msg: "MSG",
    hcsb: "HCSB",
    csb: "CSB",
    "christian standard bible": "CSB",
    "christian standard": "CSB",
    nrs: "NRSV",
    nrsv: "NRSV",
    "new revised standard": "NRSV",
    nrsvue: "NRSVue",
    asv: "ASV",
    "american standard version": "ASV",
    "american standard": "ASV",
    web: "WEB",
    "world english bible": "WEB",
    "world english": "WEB",
    bsb: "BSB",
    "berean standard bible": "BSB",
    "berean standard": "BSB",
    ylt: "YLT",
    "young's literal translation": "YLT",
    "young's literal": "YLT",
    dby: "DBY",
    "darby translation": "DBY",
    "darby bible": "DBY",
    darby: "DBY",
    gnb: "GNB",
    "good news bible": "GNB",
    "good news translation": "GNB",
    tlv: "TLV",
    "tree of life version": "TLV",
    "tree of life": "TLV",
    isv: "ISV",
    "international standard version": "ISV"
}

const NEXT_VERSE_PATTERN = /\b(?:next|following)\s+(?:verse|one|scripture|passage)\b|\bonward(?:\s+to\s+the\s+next)?\b/i
const PREVIOUS_VERSE_PATTERN = /\b(?:previous|last)\s+(?:verse|one|scripture|passage)\b|\bgo\s+back\s+(?:a|one)?\s*(?:verse)?\b|\bback\s+(?:up|one)\b/i
const TRANSLATION_PATTERN = /\b(?:give\s+me|switch\s+to|change\s+to|open(?:\s+up)?|read\s+(?:from|the)|show\s+me|put\s+(?:the\s+)?(?:nlt|esv|niv|kjv|nkjv|nasb|web|asv|bsb|amp|msg|csb|ylt|tlv|isv)?\s*(?:on)?|use)\s+(?:the\s+|new\s+king\s+james\s+)?([a-z0-9'’\-. ]{2,45}?)(?:\s+(?:version|bible|translation))?\s*(?:please|now|instead)?\s*[.?!]*$/i

function normalizeName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/\s+/g, " ")
        .replace(/(?:\s+(version|bible|translation))*$/, "")
        .trim()
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchesInstalled(normalized: string, installed: InstalledTranslation[]): InstalledTranslation | null {
    const requestedWord = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i")
    for (const scripture of installed) {
        const names = [scripture.customName, scripture.name, scripture.id].filter(Boolean).map((n) => String(n))
        for (const name of names) {
            const candidate = normalizeName(name)
            if (candidate === normalized) return scripture
            // short or full form as whole words inside a longer name ("KJV (King James Version)")
            if (requestedWord.test(candidate)) return scripture
        }
    }
    return null
}

export function detectVoiceCommand(chunk: string, installed: InstalledTranslation[]): VoiceCommand | null {
    const text = chunk.trim()
    if (text.length < 3) return null

    // order matters: "give me the next verse" is a navigation command
    if (NEXT_VERSE_PATTERN.test(text)) return { command: "next_verse" }
    if (PREVIOUS_VERSE_PATTERN.test(text)) return { command: "previous_verse" }

    const translationMatch = text.match(TRANSLATION_PATTERN)
    if (!translationMatch) return null

    const requested = normalizeName(translationMatch[1] || "")
    if (!requested || requested.length < 2) return null
    // ignore navigation-ish words caught by the capture group
    if (/^(next|previous|last|verse|one|us|it|that|this|them|him|her|word|bible)$/.test(requested)) return null

    const installedMatch = matchesInstalled(requested, installed)
    if (installedMatch) {
        const name = installedMatch.customName || installedMatch.name || installedMatch.id
        return { command: "translation", translationId: installedMatch.id, name: String(name) }
    }

    if (KNOWN_TRANSLATION_ALIASES[requested]) return { command: "translation_missing", name: KNOWN_TRANSLATION_ALIASES[requested] }

    // the alias may be buried in the spoken phrase ("put the NLT on screen");
    // word boundaries avoid matching "amp" inside "example"
    for (const [alias, shortName] of Object.entries(KNOWN_TRANSLATION_ALIASES)) {
        if (alias.length < 3) continue
        const aliasWord = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i")
        if (!aliasWord.test(text)) continue
        const alreadyInstalled = installed.some((s) => [s.customName, s.name, s.id].some((n) => aliasWord.test(String(n))))
        if (!alreadyInstalled) return { command: "translation_missing", name: shortName }
    }

    return null
}

// pure verse navigation used by the executor: "John 3:16" + 1 = "John 3:17"
export function navFromReference(ref: string, verseCount: number, delta: 1 | -1): { next: string; nextVerse: number } | null {
    const match = ref.match(/^(.*?)\s+(\d+):(\d+)(?:-\d+)?$/)
    if (!match) return null

    const book = match[1]
    const chapter = parseInt(match[2], 10)
    const verse = parseInt(match[3], 10)
    const nextVerse = verse + delta
    if (nextVerse < 1 || nextVerse > Math.max(verseCount, 1)) return null

    return { next: `${book} ${chapter}:${nextVerse}`, nextVerse }
}
