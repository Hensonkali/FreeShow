import { get } from "svelte/store"
import { ai, mediaDownloads } from "../../stores"
import { newToast } from "../../utils/common"
import { resolveSttEngine } from "../stt/stt"
import { getNemotronStatus, startNemotronDownload } from "./nemotronSetup"

// Runs once per app start (called from startupMain). If the active speech
// engine's model files are missing, a background download starts automatically
// so the app is fully usable offline afterwards. Only openly licensed models
// (manifest autoDownload flag) are fetched this way. Never blocks startup and
// never re-downloads: verified files are skipped, partial files are resumed.
let checkStarted = false
export function ensureRequiredModels() {
    if (checkStarted) return
    checkStarted = true

    void ensureNemotronModel()
}

async function ensureNemotronModel() {
    if (resolveSttEngine() !== "nemotron") return
    if (get(ai)?.stt?.autoDownloadModels === false) return

    let status = null
    try {
        status = await getNemotronStatus()
    } catch {
        return
    }
    if (!status || status.ready || status.reason === "unsupported") return

    // a download started from the settings UI may already be running
    if ([...get(mediaDownloads).values()].some((entry) => entry.status === "downloading")) return

    newToast("ai.model_autodownload_started")
    startNemotronDownload()
    watchNemotronDownload()
}

function watchNemotronDownload() {
    let sawActive = false
    const unsubscribe = mediaDownloads.subscribe((downloads) => {
        const entry = downloads.get("nemotron")
        if (entry?.status === "error") {
            // the next app start tries again (partial files resume)
            newToast("ai.model_download_failed")
            unsubscribe()
            return
        }
        if (entry) {
            sawActive = true
            return
        }
        if (sawActive) {
            newToast("ai.model_ready")
            unsubscribe()
        }
    })
}
