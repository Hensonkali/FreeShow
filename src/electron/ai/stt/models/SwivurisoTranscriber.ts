import fs from "fs"
import os from "os"
import path from "path"
import type { SttEngineOptions } from "../../../../types/ai/AiSettings"
import { SwivurisoSetupManager } from "./swivuriso"
import type { TranscriberSegment } from "../sttHelper"
import { buildWavHeader } from "./wav"

// Swivuriso engine: Whisper large-v3-turbo (MIT fine-tune on the Swivuriso
// dataset) via whisper.cpp. Listens in ~6 second chunks (plan: 5-8s): audio is
// cut, written to a temp WAV and transcribed by an external whisper-cli binary.
// On slow CPUs a transcription can take longer than the chunk, so busy periods
// DROP chunks instead of queuing — detection keeps following the speaker.

const CHUNK_MS = 3000
const SAMPLES_PER_MS = 16 // 16 kHz
const CONFIDENCE = 75 // fixed estimate; whisper-cli prints no token probabilities

interface TranscriberCallbacks {
    onSegment: (segment: TranscriberSegment) => void
    onError: (message: string) => void
}

export class SwivurisoTranscriber {
    private buffer: Buffer[] = []
    private bufferedSamples = 0
    private busy = false
    private stopped = false
    private tempDir = ""
    private clockMs = 0
    private activeProcess: { kill: () => void } | null = null

    constructor(
        private options: SttEngineOptions,
        private callbacks: TranscriberCallbacks
    ) {}

    async start(): Promise<void> {
        this.stopped = false
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeshow-swivuriso-"))
    }

    pushAudio(chunk: Uint8Array) {
        if (this.stopped) return
        this.buffer.push(Buffer.from(chunk))
        this.bufferedSamples += chunk.byteLength / 2

        if (this.bufferedSamples >= CHUNK_MS * SAMPLES_PER_MS) void this.transcribeChunk()
    }

    async stop(): Promise<void> {
        this.stopped = true
        this.activeProcess?.kill()
        this.activeProcess = null
        // flush a short trailing chunk so the last words are not lost
        if (this.bufferedSamples > SAMPLES_PER_MS * 1000) await this.transcribeChunk()
        this.buffer = []
        this.bufferedSamples = 0

        if (this.tempDir) {
            try {
                fs.rmSync(this.tempDir, { recursive: true, force: true })
            } catch {}
            this.tempDir = ""
        }
    }

    private async transcribeChunk(): Promise<void> {
        if (this.busy || this.stopped || !this.buffer.length) return
        this.busy = true

        const audio = Buffer.concat(this.buffer)
        this.buffer = []
        const chunkStartMs = this.clockMs
        this.clockMs += audio.byteLength / 2 / SAMPLES_PER_MS
        this.bufferedSamples = 0

        try {
            const text = await this.runWhisper(audio)
            if (text && !this.stopped) {
                this.callbacks.onSegment({ text, startMs: chunkStartMs, endMs: this.clockMs, confidence: CONFIDENCE, language: this.options.language || "zu" })
            }
        } catch (err) {
            if (!this.stopped) this.callbacks.onError(String((err as Error)?.message || err))
        } finally {
            this.busy = false
            // if speech arrived while busy and already fills a chunk, transcribe it now
            if (!this.stopped && this.bufferedSamples >= CHUNK_MS * SAMPLES_PER_MS) void this.transcribeChunk()
        }
    }

    private async runWhisper(audio: Buffer): Promise<string> {
        const { binary, model } = SwivurisoSetupManager.getReadyPaths()
        if (!binary || !model) throw new Error("Swivuriso model or whisper-cli binary is missing")

        const wavPath = path.join(this.tempDir, `chunk-${Date.now()}.wav`)
        const sampleRate = 16000
        fs.writeFileSync(wavPath, Buffer.concat([buildWavHeader({ dataBytes: audio.byteLength, sampleRate }), audio]))

        const { spawn } = require("child_process")
        const args = ["-m", model, "-f", wavPath, "-l", this.options.language || "zu", "-np", "-nt", "-t", "4"]
        const child = spawn(binary, args, { windowsHide: true })
        this.activeProcess = child

        return await new Promise<string>((resolve, reject) => {
            let stdout = ""
            child.stdout?.on("data", (data: Buffer) => (stdout += data.toString()))
            child.stderr?.on("data", () => {}) // whisper.cpp logs progress to stderr
            child.on("error", reject)
            child.on("close", (code: number) => {
                this.activeProcess = null
                try {
                    fs.unlinkSync(wavPath)
                } catch {}
                if (this.stopped) return resolve("")
                if (code !== 0) return reject(new Error(`whisper-cli exited with code ${code}`))
                resolve(stdout.trim())
            })
        })
    }
}
