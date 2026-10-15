import { describe, expect, it } from "vitest"
import { formatDownloadedMb, getDownloadPercent, resolveNemotronUiState, type NemotronDownloadInfo } from "./nemotronUiState"

const downloading: NemotronDownloadInfo = { progress: 341_100_000, total: 682_200_000, status: "downloading" }
const errored: NemotronDownloadInfo = { progress: 10, total: 100, status: "error" }

describe("resolveNemotronUiState", () => {
    it("is loading before the first status arrives", () => {
        expect(resolveNemotronUiState(null, undefined, false)).toBe("loading")
    })

    it("is ready when the engine reports ready", () => {
        expect(resolveNemotronUiState({ ready: true }, undefined, false)).toBe("ready")
        expect(resolveNemotronUiState({ ready: true }, errored, false)).toBe("ready")
    })

    it("is unsupported on devices that cannot run the model", () => {
        expect(resolveNemotronUiState({ ready: false, reason: "unsupported" }, undefined, false)).toBe("unsupported")
        // unsupported wins over a stale download entry
        expect(resolveNemotronUiState({ ready: false, reason: "unsupported" }, downloading, true)).toBe("unsupported")
    })

    it("is downloading while a download runs", () => {
        expect(resolveNemotronUiState({ ready: false, reason: "missing" }, downloading, false)).toBe("downloading")
        // local flag covers the gap before the first progress event arrives
        expect(resolveNemotronUiState({ ready: false, reason: "missing" }, undefined, true)).toBe("downloading")
    })

    it("is error after a failed download", () => {
        expect(resolveNemotronUiState({ ready: false, reason: "missing" }, errored, false)).toBe("error")
    })

    it("is outdated when files changed upstream", () => {
        expect(resolveNemotronUiState({ ready: false, reason: "outdated" }, undefined, false)).toBe("outdated")
    })

    it("is missing on a fresh install", () => {
        expect(resolveNemotronUiState({ ready: false, reason: "missing" }, undefined, false)).toBe("missing")
        // old servers may omit reason: still show missing, never a bare error
        expect(resolveNemotronUiState({ ready: false, error: "The local model is missing" }, undefined, false)).toBe("missing")
    })
})

describe("getDownloadPercent", () => {
    it("computes floored percent capped at 100", () => {
        expect(getDownloadPercent(downloading)).toBe(50)
        expect(getDownloadPercent({ progress: 200, total: 100 })).toBe(100)
        expect(getDownloadPercent(undefined)).toBe(0)
        expect(getDownloadPercent({ progress: 0, total: 0 })).toBe(0)
    })
})

describe("formatDownloadedMb", () => {
    it("formats progress over total in MB", () => {
        expect(formatDownloadedMb(downloading)).toBe("325 MB / 650 MB")
        expect(formatDownloadedMb(undefined)).toBe("")
    })
})
