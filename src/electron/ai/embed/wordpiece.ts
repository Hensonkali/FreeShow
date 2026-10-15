// Minimal BERT WordPiece tokenizer for the MiniLM embedding model.
// Pure functions only (no onnxruntime import) so this stays unit-testable.
// Vocab comes from the model's tokenizer.json ("model" -> "vocab").

export interface WordPieceVocab {
    ids: Map<string, number>
    unkId: number
    clsId: number
    sepId: number
    padId: number
}

export function buildVocab(vocabObject: Record<string, number>): WordPieceVocab {
    const ids = new Map(Object.entries(vocabObject))
    const get = (token: string, fallback: number) => ids.get(token) ?? fallback
    return { ids, unkId: get("[UNK]", 100), clsId: get("[CLS]", 101), sepId: get("[SEP]", 102), padId: get("[PAD]", 0) }
}

function splitPunctuation(text: string): string[] {
    // BERT basic tokenization: isolate ASCII punctuation, keep the rest whole
    return text
        .toLowerCase()
        .replace(/([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, " $1 ")
        .split(/\s+/)
        .filter(Boolean)
}

export function wordpieceTokenizeWord(word: string, vocab: WordPieceVocab): number[] {
    if (word.length > 200) return [vocab.unkId]

    const ids: number[] = []
    let start = 0
    while (start < word.length) {
        let end = word.length
        let found: number | undefined
        while (start < end) {
            const piece = (start === 0 ? "" : "##") + word.slice(start, end)
            const id = vocab.ids.get(piece)
            if (id !== undefined) {
                found = id
                break
            }
            end--
        }
        if (found === undefined) return [vocab.unkId]
        ids.push(found)
        start = end
    }
    return ids
}

export function tokenize(text: string, vocab: WordPieceVocab): number[] {
    const ids: number[] = []
    for (const word of splitPunctuation(text)) {
        ids.push(...wordpieceTokenizeWord(word, vocab))
    }
    return ids
}

export interface EncodedInput {
    inputIds: number[]
    attentionMask: number[]
}

// single-sequence encoding with [CLS]/[SEP], truncated to maxLength
export function encode(text: string, vocab: WordPieceVocab, maxLength = 128): EncodedInput {
    const tokens = tokenize(text, vocab).slice(0, maxLength - 2)
    const inputIds = [vocab.clsId, ...tokens, vocab.sepId]
    const attentionMask = new Array(inputIds.length).fill(1)
    return { inputIds, attentionMask }
}

// pad a batch of encoded inputs to equal length (0 = pad id)
export function padBatch(batch: EncodedInput[], padId: number): { inputIds: number[][]; attentionMask: number[][] } {
    const length = Math.max(...batch.map((item) => item.inputIds.length))
    return {
        inputIds: batch.map((item) => [...item.inputIds, ...new Array(length - item.inputIds.length).fill(padId)]),
        attentionMask: batch.map((item) => [...item.attentionMask, ...new Array(length - item.attentionMask.length).fill(0)])
    }
}

// mean pooling over the sequence (respects the attention mask) + L2 normalize
export function meanPool(hiddenState: Float32Array, seqLength: number, hiddenSize: number, mask: number[]): Float32Array {
    const pooled = new Float32Array(hiddenSize)
    let count = 0
    for (let i = 0; i < seqLength; i++) {
        if (!mask[i]) continue
        count++
        for (let j = 0; j < hiddenSize; j++) pooled[j] += hiddenState[i * hiddenSize + j]
    }
    if (count > 0) for (let j = 0; j < hiddenSize; j++) pooled[j] /= count

    let norm = 0
    for (let j = 0; j < hiddenSize; j++) norm += pooled[j] * pooled[j]
    norm = Math.sqrt(norm) || 1
    for (let j = 0; j < hiddenSize; j++) pooled[j] /= norm
    return pooled
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
    return sum
}
