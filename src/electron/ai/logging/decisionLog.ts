import { app } from "electron"
import fs from "fs"
import path from "path"
import type { AiDecisionLog } from "../../../types/ai/Ai"

// AI detection decisions, one JSON object per line, one file per day:
// <userData>/logs/ai-decisions-YYYY-MM-DD.log
// Best effort: logging must never throw into the caller.
function getLogPath(now = new Date()): string {
    const day = now.toISOString().slice(0, 10)
    return path.join(app.getPath("userData"), "logs", `ai-decisions-${day}.log`)
}

export function appendDecisionLog(entry: AiDecisionLog): void {
    try {
        const filePath = getLogPath()
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.appendFileSync(filePath, `${JSON.stringify({ ...entry, t: entry.t || Date.now() })}\n`, "utf8")
    } catch (err) {
        console.error("[ai] Could not write decision log:", err)
    }
}

export function getDecisionLogPath(): string {
    return getLogPath()
}
