import { Main } from "../../../types/IPC/Main"
import type { AiDecisionLog } from "../../../types/ai/Ai"
import { sendMain } from "../../IPC/main"
import { shouldSkipDuplicate } from "./decisionLogCore"

// Every AI detection decision is appended to a daily JSONL file (see
// electron/ai/logging/decisionLog.ts). Fire-and-forget: logging must never
// slow down or break detection.
export function logDecision(entry: Omit<AiDecisionLog, "t"> & { t?: number }) {
    try {
        sendMain(Main.AI_LOG, { ...entry, t: entry.t ?? Date.now() })
    } catch {}
}

// identical decisions (same verse + outcome) repeat every chunk while a
// preacher dwells on one verse; collapse them so the file stays readable
export function logDecisionDeduped(entry: Omit<AiDecisionLog, "t"> & { t?: number }) {
    const full = { ...entry, t: entry.t ?? Date.now() } as AiDecisionLog
    if (shouldSkipDuplicate(full, full.t)) return
    logDecision(full)
}

export { decisionSignature, formatDecisionLine, shouldSkipDuplicate } from "./decisionLogCore"
