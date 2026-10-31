<script lang="ts">
    import { startScripture } from "../../../components/actions/apiHelper"
    import { getShortBibleName } from "../../../components/drawer/bible/scripture"
    import { aiSuggestions, scriptures, outLocked } from "../../../stores"
    import { logDecisionDeduped } from "../../logging/decisionLog"
    import T from "../../../components/helpers/T.svelte"
    import ConfidenceMeter from "./ConfidenceMeter.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"

    let show = false
    let currentSuggestion: any = null
    let dismissTimer: NodeJS.Timeout | null = null

    $: suggestions = $aiSuggestions

    // auto-show overlay when a "present" suggestion appears
    $: {
        const pending = suggestions.find((s) => s.action === "present" && !$outLocked)
        if (pending && !show) {
            currentSuggestion = pending
            show = true
            // auto-dismiss after 10 seconds if no action
            if (dismissTimer) clearTimeout(dismissTimer)
            dismissTimer = setTimeout(() => {
                skip()
            }, 10000)
        }
        if (!pending && show) {
            show = false
            currentSuggestion = null
            if (dismissTimer) clearTimeout(dismissTimer)
        }
    }

    function approve() {
        if (!currentSuggestion) return
        logDecisionDeduped({
            heard: "",
            ref: currentSuggestion.content,
            confidence: currentSuggestion.confidence,
            action: "override_presented",
            reason: "user_approved_overlay"
        })
        startScripture({ reference: currentSuggestion.content, play: true })
        show = false
        currentSuggestion = null
        if (dismissTimer) clearTimeout(dismissTimer)
    }

    function skip() {
        if (!currentSuggestion) return
        logDecisionDeduped({
            heard: "",
            ref: currentSuggestion.content,
            confidence: currentSuggestion.confidence,
            action: "dismissed",
            reason: "user_skipped_overlay"
        })
        show = false
        currentSuggestion = null
        if (dismissTimer) clearTimeout(dismissTimer)
    }
</script>

{#if show && currentSuggestion}
    <div class="approve-overlay">
        <div class="approve-card">
            <div class="approve-header">
                <span class="badge">{currentSuggestion.confidence}%</span>
                <span class="translate">
                    {getShortBibleName($scriptures[currentSuggestion.scriptureTranslation]?.name)}
                </span>
            </div>

            <div class="approve-body">
                <div class="heard">
                    <T id="ai.heard" />: <strong>{currentSuggestion.content}</strong>
                </div>
                <div class="detected">
                    <T id="ai.verse" />: <strong>{currentSuggestion.content}</strong>
                </div>
                <ConfidenceMeter confidence={currentSuggestion.confidence} />

                <div class="approve-actions">
                    <MaterialButton variant="outlined" icon="close" style="flex: 1;" on:click={skip}>
                        <T id="ai.skip" />
                    </MaterialButton>
                    <MaterialButton variant="filled" icon="play" style="flex: 1;" on:click={approve}>
                        <T id="ai.present" />
                    </MaterialButton>
                </div>

                <div class="approve-hint">
                    <T id="ai.overlay_hint" />
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .approve-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.4);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        box-sizing: border-box;
    }

    .approve-card {
        background: var(--primary-darkest);
        border: 2px solid var(--secondary);
        border-radius: 8px;
        padding: 20px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        animation: slideDown 0.3s ease;
    }

    @keyframes slideDown {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    .approve-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .badge {
        background: var(--secondary);
        color: var(--primary-darkest);
        padding: 2px 10px;
        border-radius: 12px;
        font-weight: bold;
        font-size: 0.9em;
    }

    .translate {
        font-size: 0.85em;
        opacity: 0.8;
    }

    .approve-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .heard {
        font-size: 0.9em;
        opacity: 0.8;
    }

    .detected {
        font-size: 1.3em;
        font-weight: bold;
        color: var(--secondary);
    }

    .approve-actions {
        display: flex;
        gap: 10px;
        margin-top: 4px;
    }

    .approve-hint {
        font-size: 0.8em;
        opacity: 0.7;
        margin-top: 8px;
    }
</style>