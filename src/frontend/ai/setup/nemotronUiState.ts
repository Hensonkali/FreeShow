import type { EngineStatus } from "../../../types/ai/Ai"

export interface NemotronDownloadInfo {
    progress: number
    total: number
    status: string
    name?: string
}

// every visible state of the Nemotron model setup UI
export type NemotronUiState = "loading" | "ready" | "unsupported" | "downloading" | "error" | "outdated" | "missing"

export function resolveNemotronUiState(status: EngineStatus | null, download: NemotronDownloadInfo | undefined, downloadStarted: boolean): NemotronUiState {
    if (!status) return "loading"
    if (status.ready) return "ready"
    if (status.reason === "unsupported") return "unsupported"
    if (downloadStarted || download?.status === "downloading") return "downloading"
    if (download?.status === "error") return "error"
    if (status.reason === "outdated") return "outdated"
    return "missing"
}

export function getDownloadPercent(download: { progress: number; total: number } | undefined): number {
    if (!download?.total) return 0
    return Math.min(100, Math.floor((download.progress / download.total) * 100))
}

export function formatDownloadedMb(download: { progress: number; total: number } | undefined): string {
    if (!download?.total) return ""
    const toMb = (bytes: number) => `${Math.floor(bytes / 1048576)} MB`
    return `${toMb(Math.min(download.progress, download.total))} / ${toMb(download.total)}`
}
