import { get, type Unsubscriber } from "svelte/store"
import { uid } from "uid"
import type { AiSuggestion, MatchResult } from "../../../types/ai/Ai"
import type { ConfidenceLevels } from "../../../types/ai/AiSettings"
import { startScripture } from "../../components/actions/apiHelper"
import { keysToID } from "../../components/helpers/array"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { setActiveScripture } from "../../converters/bible"
import { ai, aiSmartAction, aiSuggestions, drawerTabsData, outputs, scriptures, sttTranscript } from "../../stores"
import { newToast } from "../../utils/common"
import { Main } from "../../../types/IPC/Main"
import { requestMain } from "../../IPC/main"
import { getLLMManager } from "../llm/llmManager"
import { logDecisionDeduped } from "../logging/decisionLog"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleVersion } from "../scripture/BibleVersionDetector"
import { isReferenceWithin } from "../scripture/references"
import { selectEmbeddingSuggestion } from "../scripture/embeddingSuggest"
import { detectVoiceCommand, type InstalledTranslation } from "../scripture/voiceCommands"

export class AiManager {
    private static lastMatch: number = 0
    private static MAX_LLM_REQUEST_AFTER_MATCH = 5000
    private static latestSearchId: number = 0

    static async processSTTChunk(chunk: { chunkWithOverlap: string; newWordsCount: number; confidence?: number }) {
        this.triggerBackgroundPreload()

        const searchId = ++this.latestSearchId
        const isCancelled = () => searchId !== this.latestSearchId

        // explicit voice commands execute immediately ("next verse", "give me NLT")
        const commandHandled = await this.voiceCommandDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return
        if (commandHandled) {
            this.lastMatch = Date.now()
            return
        }

        const stringMatch = await this.stringDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return

        if (stringMatch) {
            this.newMatch(stringMatch, chunk.chunkWithOverlap)
            this.lastMatch = Date.now()
            return
        }

        const embedMatch = await this.embeddingDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return

        // embedding matches are suggestions only (enforced again in shouldAutoPlay)
        if (embedMatch) {
            this.newMatch(embedMatch, chunk.chunkWithOverlap)
            this.lastMatch = Date.now()
            return
        }

        if (this.lastMatch && Date.now() - this.lastMatch < this.MAX_LLM_REQUEST_AFTER_MATCH) return

        const llmManager = getLLMManager()
        if (!llmManager) return

        // only report to LLM if nothing is auto detected
        const llmMatch = await llmManager.detectMatch(chunk)
        if (llmMatch) {
            this.newMatch(llmMatch, chunk.chunkWithOverlap)
            this.lastMatch = Date.now()
        }
    }

    private static async stringDetection(textChunk: string, isCancelled?: () => boolean) {
        const scriptureMatch = await this.globalBibleDetection(textChunk, isCancelled)
        if (scriptureMatch) return scriptureMatch

        const scriptureVersionMatch = await detectBibleVersion(textChunk, isCancelled)
        if (scriptureVersionMatch) return scriptureVersionMatch

        return null
    }

    private static isPreloadStarted: boolean = false
    private static triggerBackgroundPreload() {
        if (this.isPreloadStarted) return
        this.isPreloadStarted = true

        // load scriptures
        const localScriptureIds = this.getLocalScriptureIds()
        BibleCacheManager.preloadAllInBackground(localScriptureIds)
    }

    private static getLocalScriptureIds() {
        return keysToID(get(scriptures))
            .filter((a) => !a.api && !a.collection)
            .map((a) => a.id)
    }

    private static scriptureAlerted: boolean = false
    private static async globalBibleDetection(textChunk: string, isCancelled?: () => boolean) {
        const activeBibleId = get(drawerTabsData)?.scripture?.activeSubTab
        if (!activeBibleId) return null

        const scriptureData = get(scriptures)[activeBibleId]
        if (scriptureData?.api) {
            if (!this.scriptureAlerted) newToast("Please use a local Bible instead of an API Bible for the auto detection!")
            this.scriptureAlerted = true
            return null
        }

        const match = await this.bibleDetection(activeBibleId, textChunk, isCancelled)
        if (!match) return null

        // reference type matches stays on the active scripture
        if (match.scriptureMatchType !== "content") return match

        let highestConfidence = match.confidence || 0

        // Non-blocking concurrent scan
        Promise.all(
            this.getLocalScriptureIds().map(async (id) => {
                // already checked
                if (id === activeBibleId) return

                const otherMatch = await this.bibleDetection(id, textChunk, isCancelled)
                if (otherMatch?.confidence && otherMatch.confidence > highestConfidence) {
                    highestConfidence = otherMatch.confidence
                    this.newMatch({ ...otherMatch, scriptureIsNewTranslation: true }, textChunk)
                }
            })
        )

        return match
    }

    private static async bibleDetection(id: string, textChunk: string, isCancelled?: () => boolean) {
        const bibleCache = await BibleCacheManager.getCache(id)
        if (!bibleCache || isCancelled?.()) return null

        const match = await bibleCache.search(textChunk, AiManager.liveContent, isCancelled)
        if (!match) return null

        match.scriptureTranslation = id
        return match
    }

    private static lastCommand: { signature: string; at: number } | null = null
    private static async voiceCommandDetection(textChunk: string, isCancelled?: () => boolean): Promise<boolean> {
        // ALL installed Bibles, offline AND online — switching translation is a display action
        const installed = keysToID(get(scriptures))
            .filter((a: any) => !a.collection)
            .map((a: any) => ({ id: a.id, name: a.name, customName: a.customName })) as InstalledTranslation[]

        const command = detectVoiceCommand(textChunk, installed)
        if (!command) return false

        // dedup: chunk overlap repeats the last words, so the same utterance arrives twice.
        // Navigation commands key on the transcript length — each NEW "next verse" advances,
        // while the overlap echo (same chunk, same length) is ignored. Translation switches
        // also wait out a 30s window so a repeated phrase can't flip Bibles back and forth.
        const now = Date.now()
        const isNavigation = command.command === "next_verse" || command.command === "previous_verse"
        const signature = isNavigation ? `${command.command}|${(get(sttTranscript).finalized + get(sttTranscript).unprocessed).length}` : JSON.stringify(command)
        if (this.lastCommand && this.lastCommand.signature === signature && (isNavigation ? now - this.lastCommand.at < 2000 : now - this.lastCommand.at < 30000)) return true
        this.lastCommand = { signature, at: now }

        const heard = textChunk
        const activeBibleId = get(drawerTabsData)?.scripture?.activeSubTab

        if (command.command === "next_verse" || command.command === "previous_verse") {
            if (!this.liveContent) {
                newToast("ai.command_no_scripture")
                logDecisionDeduped({ heard, action: "suppressed", reason: "no_live_scripture" })
                return true
            }

            const delta = command.command === "next_verse" ? 1 : -1
            const nextRef = activeBibleId ? await BibleCacheManager.navigate(activeBibleId, this.liveContent, delta) : null
            if (!nextRef) {
                logDecisionDeduped({ heard, ref: this.liveContent, action: "suppressed", reason: "verse_out_of_range" })
                return true
            }
            if (isCancelled?.()) return true

            this.lastPresented = { content: nextRef, at: Date.now() }
            startScripture({ reference: nextRef })
            this.outputUpdate(nextRef)
            logDecisionDeduped({ heard, ref: nextRef, action: "presented", reason: "voice_command" })
            return true
        }

        if (command.command === "translation") {
            setActiveScripture(command.translationId)
            newToast(`Switched to ${command.name}`)
            logDecisionDeduped({ heard, ref: command.name, action: "presented", reason: "voice_command_translation" })

            // "show this in Zulu" — re-present the passage on screen in the new translation
            if (this.liveContent) {
                this.lastPresented = { content: this.liveContent, at: Date.now() }
                startScripture({ reference: this.liveContent })
                this.outputUpdate(this.liveContent)
            }
            return true
        }

        // translation_missing: say so on screen instead of showing a wrong verse
        newToast(`${command.name} is not installed`)
        logDecisionDeduped({ heard, ref: command.name, action: "suppressed", reason: "translation_not_installed" })
        return true
    }

    private static async embeddingDetection(textChunk: string, isCancelled?: () => boolean) {
        // paraphrase search needs the embedding model; disable it to save RAM on small machines
        if (get(ai)?.paraphraseSearch === false) return null

        const activeBibleId = get(drawerTabsData)?.scripture?.activeSubTab
        if (!activeBibleId) return null

        const scriptureData = get(scriptures)[activeBibleId]
        if (!scriptureData || scriptureData?.api) return null

        let result = null
        try {
            result = await requestMain(Main.AI_EMBED_QUERY, { text: textChunk, bibleId: activeBibleId, name: scriptureData.name, topK: 3 })
        } catch {
            return null
        }
        if (isCancelled?.() || !result?.results?.length) return null

        return selectEmbeddingSuggestion(result.results, activeBibleId)
    }

    /////

    static newMatch(match: MatchResult, heard = "") {
        if (match.type === "empty" || !match.content) return
        if (match.type !== "scripture" && match.type !== "scripture_version") return // WIP only scripture is implemented

        const base = { heard, detector: match.detector, ref: match.content, confidence: match.confidence, translation: match.scriptureTranslation }

        if (match.type === "scripture" && AiManager.liveContent === match.content) {
            logDecisionDeduped({ ...base, action: "suppressed", reason: "already_live" })
            return
        }

        let suggestionDraft: any = {
            id: uid(5),
            timestamp: Date.now(),
            content: match.content,
            confidence: match.confidence
        }
        if (match.scriptureIsNewTranslation) suggestionDraft.scriptureTranslation = match.scriptureTranslation

        // user approvals are logged as overrides; auto-present calls triggerMatchAction directly
        const trigger = () => {
            logDecisionDeduped({ ...base, action: "override_presented" })
            this.triggerMatchAction(match)
        }

        if (match.type === "scripture") {
            const decision = this.autoPlayDecision(match)
            if (decision.play) {
                const suggestion = { ...suggestionDraft, action: "presented" }
                this.addSuggestion(suggestion)

                console.info(`Auto-playing ${match.type}:`, match.content)
                logDecisionDeduped({ ...base, action: "presented", reason: decision.reason })
                this.triggerMatchAction(match)
                return
            }

            const suggestion = { ...suggestionDraft, action: "present", trigger }
            logDecisionDeduped({ ...base, action: "suggested", reason: decision.reason })
            this.addSuggestion(suggestion)
            return
        }

        const suggestion = { ...suggestionDraft, action: "open_scripture", trigger }
        logDecisionDeduped({ ...base, action: "suggested", reason: "version_switch" })
        this.addSuggestion(suggestion)
    }

    private static alreadySuggested(match: MatchResult): boolean {
        // get suggested, but remove any suggestions that have lower confidence than the current match
        const suggested = get(aiSuggestions)
            .filter((a) => a.content !== match.content || a.confidence >= match.confidence)
            .filter((a) => !isReferenceWithin(match.content, a.content))
            .map((item) => item.content)

        return suggested.includes(match.content)
    }

    private static MAX_AUTO_PLAY_INTERVAL = 30000
    // the same verse is not auto-shown twice within the cooldown (suggestions still appear)
    private static REPEAT_COOLDOWN_MS = 5 * 60 * 1000
    private static lastPresented: { content: string; at: number } | null = null

    private static autoPlayDecision(match: MatchResult): { play: boolean; reason: string } {
        // shadow mode: detect and log, never display (rehearse on recorded sermons)
        if (get(ai)?.shadowMode) return { play: false, reason: "shadow_mode" }

        // embedding paraphrase matches are suggestions only, never auto-displayed
        if (match.suggestOnly) return { play: false, reason: "suggest_only" }
        if (match.type === "scripture_version") return { play: false, reason: "version_switch" }
        if (match.type !== "scripture") return { play: false, reason: "unsupported_type" } // WIP currently only auto-plays scripture matches

        if (match.scriptureIsNewTranslation) return { play: false, reason: "new_translation" }

        // never auto-play low confidence matches
        if (match.confidence <= 50) return { play: false, reason: "low_confidence" }

        const now = Date.now()
        if (this.lastPresented && this.lastPresented.content === match.content && now - this.lastPresented.at < this.REPEAT_COOLDOWN_MS) {
            return { play: false, reason: "repeat_cooldown" }
        }

        // skip if the output was manually updated recently
        if (this.lastOutputUpdate && now - this.lastOutputUpdate < this.MAX_AUTO_PLAY_INTERVAL) return { play: false, reason: "manual_cooldown" }

        const confidence = get(ai)[match.type]?.confidence || "ask"
        if (confidence === "ask") return { play: false, reason: "ask_mode" }

        if (match.confidence <= 95 && this.alreadySuggested(match)) return { play: false, reason: "already_suggested" }

        const autoPlay = match.confidence > this.getConfidenceScore(confidence)
        if (autoPlay) this.listenToOutput()
        return autoPlay ? { play: true, reason: `auto_${confidence}` } : { play: false, reason: `below_${confidence}_threshold` }
    }

    private static getConfidenceScore(confidence: ConfidenceLevels): number {
        if (confidence === "highest") return 95
        if (confidence === "high") return 75
        if (confidence === "medium") return 50
        return 100
    }

    static liveContent: string = ""
    private static triggerMatchAction(match: MatchResult) {
        if (match.type === "scripture_version") {
            if (match.scriptureTranslation) setActiveScripture(match.scriptureTranslation)
        } else if (match.type === "scripture") {
            this.lastPresented = { content: match.content, at: Date.now() }
            startScripture({ reference: match.content })
            this.outputUpdate(match.content)
        }
    }

    private static outputUpdate(content: string) {
        this.liveContent = content

        setTimeout(() => {
            // reset output updates when not "manually" played
            this.lastOutputUpdate = 0
        }, 500)
    }

    /////

    private static smartActionTimer: NodeJS.Timeout | null = null
    private static SMART_ACTION_DURATION = 30 * 1000 // 30 seconds
    private static setSmartAction(content: AiSuggestion) {
        aiSmartAction.set(content)

        const TIMEOUT = content.action === "presented" ? 4000 : this.SMART_ACTION_DURATION

        if (this.smartActionTimer) {
            clearTimeout(this.smartActionTimer)
            this.smartActionTimer = null
        }
        this.smartActionTimer = setTimeout(() => {
            this.smartActionTimer = null
            aiSmartAction.update((a) => (a?.id === content.id ? null : a))
        }, TIMEOUT)
    }

    private static SUGGESTION_MAX_AGE = 5 * 60 * 1000 // 5 minutes
    private static SUGGESTION_LIMIT = 15
    private static addSuggestion(content: AiSuggestion) {
        this.setSmartAction(content)

        aiSuggestions.update((list) => {
            const now = Date.now()

            // remove timed out suggestions
            let active = list.filter((a) => now - a.timestamp < this.SUGGESTION_MAX_AGE)

            // remove duplicate suggestions
            active = active.filter((a) => a.id !== content.id && a.content !== content.content)

            return [content, ...active].slice(0, this.SUGGESTION_LIMIT)
        })
    }

    /////

    private static lastOutputUpdate = 0
    private static outputListener: Unsubscriber | null = null
    private static listenToOutput() {
        if (this.outputListener) return

        let initialized = false
        setTimeout(() => (initialized = true), 1000)

        let previousOutput = ""
        this.outputListener = outputs.subscribe(() => {
            const firstOutput = getFirstActiveOutput()
            const slide = firstOutput?.out?.slide || null

            const slideKey = JSON.stringify(slide)
            if (slideKey === JSON.stringify(previousOutput)) return
            previousOutput = slideKey

            if (initialized) this.lastOutputUpdate = Date.now()
        })
    }
}
