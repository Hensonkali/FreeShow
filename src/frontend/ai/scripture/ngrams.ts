// Character n-grams for agglutinative languages (isiZulu, isiXhosa, ...).
// Zulu words change shape with prefixes/suffixes, so whole-word matching
// fails; 4-character grams survive most morphological changes.

export const NGRAM_SIZE = 4

export function charGrams(text: string, size = NGRAM_SIZE): string[] {
    const clean = text
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
    if (clean.length < size) return []

    const grams: string[] = []
    for (let i = 0; i <= clean.length - size; i++) {
        grams.push(clean.slice(i, i + size))
    }
    return grams
}

// a Bible counts as Zulu when its (custom) name says so
export function isZuluBible(...names: (string | undefined)[]): boolean {
    return names.some((name) => Boolean(name && /zulu|isizulu/i.test(name)))
}
