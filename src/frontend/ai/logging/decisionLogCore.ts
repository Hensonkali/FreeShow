import type { AiDecisionLog } from "../../../types/ai/Ai"

// Pure decision-log helpers (no IPC/Svelte imports) so they stay unit-testable.

export function decisionSignature(entry: AiDecisionLog): string {
    return [entry.action, entry.ref || "", entry.reason || "", entry.detector || ""].join("|")
}

let lastSignature = ""
let lastLoggedAt = 0
const DUPLICATE_WINDOW_MS = 30 * 1000

// true = skip this entry (an identical one was logged moments ago);
// user overrides are always logged
export function shouldSkipDuplicate(entry: AiDecisionLog, now = Date.now()): boolean {
    if (entry.action === "override_presented" || entry.action === "override_opened" || entry.action === "dismissed") return false
    const signature = decisionSignature(entry)
    const elapsed = now - lastLoggedAt
    if (signature === lastSignature && elapsed >= 0 && elapsed < DUPLICATE_WINDOW_MS) return true
    lastSignature = signature
    lastLoggedAt = now
    return false
}

export function formatDecisionLine(entry: AiDecisionLog): string {
    return JSON.stringify(entry)
}
