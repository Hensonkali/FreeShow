import path from "path"
import { ToMain } from "../../../types/IPC/ToMain"
import { sendToMain } from "../../IPC/main"
import { createFolder } from "../../utils/files"
import { DownloadManager } from "../setup/DownloadManager"
import { MINILM_MODEL } from "../setup/models"
import { embeddingEngine } from "./embeddings"

const MODEL = MINILM_MODEL

function getEmbedDir() {
    // same folder the engine reads from (duplicated here to avoid an electron import)
    const { app } = require("electron")
    return path.join(app.getPath("userData"), "bin", "embeddings")
}

export class EmbeddingSetupManager {
    private static dlm: DownloadManager | null = null
    static getDownloadManager() {
        if (!this.dlm) this.dlm = new DownloadManager(MODEL.id, "Verse embedding model")
        return this.dlm
    }

    static isModelReady() {
        return embeddingEngine.isModelReady()
    }

    static async downloadModel(): Promise<boolean> {
        const dlm = this.getDownloadManager()
        const outputFolder = getEmbedDir()
        createFolder(outputFolder)

        let completedBytes = 0
        for (const file of MODEL.files) {
            const target = path.join(outputFolder, file.file)

            // If file already exists with non-zero size, skip download
            try {
                const stats = await fs.promises.stat(target)
                if (stats.size > 0) {
                    console.info(`[${dlm.key}] File already exists: ${file.file} (${Math.round(stats.size / 1024 / 1024)}MB), skipping download`)
                    completedBytes += file.bytes
                    continue
                }
            } catch {
                // File doesn't exist, proceed with download
            }

            const base = completedBytes
            try {
                await dlm.downloadFile(file.url, target, {
                    onProgress: (bytes) => {
                        sendToMain(ToMain.MEDIA_DOWNLOAD_PROGRESS, { url: dlm.key, name: dlm.name, progress: base + bytes, total: MODEL.totalBytes, status: "downloading" })
                    }
                })

                // Verify sha256 after download, but don't delete on mismatch - just warn
                const digest = await dlm.computeSha256(target)
                if (digest !== file.sha256) {
                    console.warn(`[${dlm.key}] Checksum mismatch for ${file.file}: expected ${file.sha256}, got ${digest}. File may be corrupted but keeping it.`)
                }
                completedBytes = base + (require("fs").statSync(target).size as number)
            } catch (err) {
                if (dlm.isAbortError(err)) return false
                dlm.reportError(`Failed to download verse embedding model: ${dlm.errorMessage(err)}`)
                return false
            }
        }

        dlm.reportComplete()
        return true
    }

    static cancelDownload() {
        this.getDownloadManager().cancel()
    }

    private static async verifyFile(filePath: string) {
        try {
            const { statSync, existsSync } = require("fs")
            return existsSync(filePath) && statSync(filePath).size > 0
        } catch {
            return false
        }
    }
}
