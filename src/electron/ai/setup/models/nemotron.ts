import fs from "fs"
import path from "path"
import { ToMain } from "../../../../types/IPC/ToMain"
import { sendToMain } from "../../../IPC/main"
import { NEMOTRON_MODEL } from "../models"
import { DownloadManager } from "../DownloadManager"

// int8 export of NVIDIA's Nemotron 3.5 streaming transducer, multilingual. Chosen over the
// English-only 0.6b on 19 sermon excerpts: same CPU cost, better accuracy, fewer repeated words,
// around 40 languages. Pinned to a revision and per-file hashes so exactly these bytes land.
// Full manifest (URLs, sizes, licence) lives in models.ts / models.json.
const MODEL = NEMOTRON_MODEL

export const NEMOTRON_VAD_FILE = "silero_vad.onnx"
const NEMOTRON_VAD = MODEL.files.find((entry) => entry.file === NEMOTRON_VAD_FILE)
const NEMOTRON_VAD_SHA256 = NEMOTRON_VAD?.sha256 || ""

export const NEMOTRON_MODEL_FILES = Object.fromEntries(MODEL.files.filter((entry) => entry.file !== NEMOTRON_VAD_FILE).map((entry) => [entry.file.split(".")[0], { file: entry.file, sha256: entry.sha256 }]))
export const NEMOTRON_MODEL_BYTES = MODEL.totalBytes

const PINNED_FILES = [...Object.values(NEMOTRON_MODEL_FILES), { file: NEMOTRON_VAD_FILE, sha256: NEMOTRON_VAD_SHA256 }]
const STAMP_FILE = "model.json"

export type ModelIntegrity = "ok" | "missing" | "outdated"

export class NemotronSetupManager {
    static isPlatformSupported(): boolean {
        // sherpa-onnx-node does not work on Intel macOS (darwin-x64)
        if (process.platform === "darwin" && process.arch === "x64") return false
        return true
    }

    static getBinaryName() {
        return process.platform === "win32" ? "nemotron-cli.exe" : "nemotron-cli"
    }

    private static engineDLM: DownloadManager | null = null
    static getDownloadManager() {
        if (!this.engineDLM) this.engineDLM = new DownloadManager("nemotron", "Nemotron model")
        return this.engineDLM
    }

    static async downloadEngine(outputFolder: string) {
        const dlm = this.getDownloadManager()
        const jobs = MODEL.files.map((entry) => ({ url: entry.url, file: entry.file, sha256: entry.sha256 }))
        const digests: Record<string, string> = {}
        let completedBytes = 0

        for (const job of jobs) {
            const target = path.join(outputFolder, job.file)

            if (await this.verifyEngine(target)) {
                const digest = await dlm.computeSha256(target)
                if (digest === job.sha256) {
                    digests[job.file] = digest
                    completedBytes += fs.statSync(target).size
                    continue
                }
                dlm.safeUnlink(target)
            }

            const base = completedBytes
            try {
                await dlm.downloadFile(job.url, target, {
                    onProgress: (bytes) => {
                        sendToMain(ToMain.MEDIA_DOWNLOAD_PROGRESS, {
                            url: dlm.key,
                            name: dlm.name,
                            progress: base + bytes,
                            total: NEMOTRON_MODEL_BYTES,
                            status: "downloading"
                        })
                    }
                })

                const digest = await dlm.computeSha256(target)
                if (digest !== job.sha256) {
                    dlm.safeUnlink(target)
                    throw new Error(`Downloaded ${job.file} failed checksum verification`)
                }
                digests[job.file] = digest
            } catch (err) {
                if (dlm.isAbortError(err)) return { ok: false, error: "Download was cancelled." }
                return dlm.reportError(`Failed to download Nemotron model: ${dlm.errorMessage(err)}`)
            }
            completedBytes = base + fs.statSync(target).size
        }

        await this.checkIntegrity(outputFolder, digests)
        return dlm.reportComplete()
    }

    static cancelEngineDownload() {
        this.getDownloadManager().cancel()
    }

    static async verifyEngine(binaryPath: string) {
        return Boolean(binaryPath && fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 1024)
    }

    static async checkIntegrity(modelDir: string, knownDigests?: Record<string, string>): Promise<ModelIntegrity> {
        if (!knownDigests && this.isStampValid(modelDir)) return "ok"

        const files: Record<string, { sha256: string; size: number; mtimeMs: number }> = {}
        let outdated = false

        for (const entry of PINNED_FILES) {
            const file = path.join(modelDir, entry.file)
            if (!fs.existsSync(file)) return "missing"

            const stats = fs.statSync(file)
            const digest = knownDigests?.[entry.file] ?? (await this.getDownloadManager().computeSha256(file))
            if (digest !== entry.sha256) outdated = true

            files[entry.file] = { sha256: digest, size: stats.size, mtimeMs: stats.mtimeMs }
        }

        if (outdated) return "outdated"

        try {
            fs.writeFileSync(path.join(modelDir, STAMP_FILE), JSON.stringify({ revision: MODEL.revision, files }, null, 4))
        } catch (err) {
            console.error("[nemotron] Could not write the model stamp:", err)
        }
        return "ok"
    }

    private static isStampValid(modelDir: string): boolean {
        try {
            const stamp = JSON.parse(fs.readFileSync(path.join(modelDir, STAMP_FILE), "utf8"))
            if (stamp.revision !== MODEL.revision || !stamp.files) return false

            return PINNED_FILES.every((entry) => {
                const stamped = stamp.files[entry.file]
                if (!stamped || stamped.sha256 !== entry.sha256) return false
                const stats = fs.statSync(path.join(modelDir, entry.file))
                return stats.size === stamped.size && stats.mtimeMs === stamped.mtimeMs
            })
        } catch {
            return false
        }
    }
}
