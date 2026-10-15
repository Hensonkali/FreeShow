import { Main } from "../../../types/IPC/Main"
import type { EngineStatus } from "../../../types/ai/Ai"
import { requestMain, sendMain } from "../../IPC/main"

export const NEMOTRON_ENGINE_ID = "nemotron"

export async function getNemotronStatus(): Promise<EngineStatus | null> {
    const result = await requestMain(Main.AI_GET_STATUS, { engineId: NEMOTRON_ENGINE_ID })
    return result?.[NEMOTRON_ENGINE_ID] ?? null
}

// resolves true when the model is fully downloaded and verified, false otherwise
export function downloadNemotronModel(): Promise<boolean | undefined> {
    return requestMain(Main.AI_SETUP, { action: "download", engineId: NEMOTRON_ENGINE_ID }, undefined, 60 * 60 * 1000)
}

// fire-and-forget variant for background downloads (no long-lived request to time out)
export function startNemotronDownload(): void {
    sendMain(Main.AI_SETUP, { action: "download", engineId: NEMOTRON_ENGINE_ID })
}

export function cancelNemotronDownload(): void {
    sendMain(Main.AI_SETUP, { action: "cancel", engineId: NEMOTRON_ENGINE_ID })
}

export function deleteNemotronModel(): void {
    sendMain(Main.AI_SETUP, { action: "delete", engineId: NEMOTRON_ENGINE_ID })
}
