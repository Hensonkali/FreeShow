import fs from "fs"
import path from "path"
import { SWIVURISO_MODEL } from "../../setup/models"
import { DownloadManager } from "../../setup/DownloadManager"

// Swivuriso setup: Whisper large-v3-turbo MIT fine-tune (dsfsi-anv) via whisper.cpp.
// Two artifacts must exist for the engine to be ready:
//   <bin>/swivuriso/whisper-cli[.exe]        (built once, see SWIVURISO_RESEARCH.md)
//   <bin>/swivuriso/models/model-ggml.bin   (converted + quantized fine-tune)
// The in-app download below fetches the raw 3.24 GB safetensors (resumable,
// checksummed) for users who want the bytes locally before converting.

const MODEL = SWIVURISO_MODEL
const GGML_FILE = "model-ggml.bin"

export class SwivurisoSetupManager {
    static isPlatformSupported(): boolean {
        return true
    }

    static getBinaryName() {
        return process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"
    }

    private static engineDLM: DownloadManager | null = null
    static getDownloadManager() {
        if (!this.engineDLM) this.engineDLM = new DownloadManager("swivuriso", "Swivuriso model")
        return this.engineDLM
    }

    static getEngineDir(baseDir: string) {
        return path.join(baseDir, "swivuriso")
    }

    static getBinaryPath(baseDir: string) {
        return path.join(this.getEngineDir(baseDir), this.getBinaryName())
    }

    static getModelPath(baseDir: string) {
        return path.join(this.getEngineDir(baseDir), "models", GGML_FILE)
    }

    static getReadyPaths(): { binary: string | null; model: string | null } {
        // BinaryModelManager passes the bin folder through app.getPath("userData")
        const baseDir = path.join(require("electron").app.getPath("userData"), "bin")
        const binary = this.getBinaryPath(baseDir)
        const model = this.getModelPath(baseDir)
        return {
            binary: fs.existsSync(binary) ? binary : null,
            model: fs.existsSync(model) ? model : null
        }
    }

    static async downloadEngine(outputFolder: string) {
        const dlm = this.getDownloadManager()
        const job = MODEL.files[0]
        const target = path.join(outputFolder, job.file)

        try {
            await dlm.downloadFile(job.url, target, { totalBytes: job.bytes })
            const digest = await dlm.computeSha256(target)
            if (digest !== job.sha256) {
                dlm.safeUnlink(target)
                throw new Error(`Downloaded ${job.file} failed checksum verification`)
            }
        } catch (err) {
            if (dlm.isAbortError(err)) return { ok: false, error: "Download was cancelled." }
            return dlm.reportError(`Failed to download Swivuriso model: ${dlm.errorMessage(err)}`)
        }

        return dlm.reportComplete()
    }

    static cancelEngineDownload() {
        this.getDownloadManager().cancel()
    }

    static async verifyEngine(binaryPath: string) {
        return Boolean(binaryPath && fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 1024)
    }

    // "ok" when both artifacts exist, "missing" otherwise (setup instructions in UI)
    static async checkIntegrity(_engineDir: string): Promise<"ok" | "missing"> {
        const { binary, model } = this.getReadyPaths()
        return binary && model ? "ok" : "missing"
    }
}
