<script lang="ts">
    import { startScripture } from "../../../components/actions/apiHelper"
    import { getShortBibleName } from "../../../components/drawer/bible/scripture"
    import { aiSuggestions } from "../../../stores"
    import { logDecisionDeduped } from "../../logging/decisionLog"
    import T from "../../../components/helpers/T.svelte"
    import ConfidenceMeter from "./ConfidenceMeter.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"

    let show = false
    let currentSuggestion: any = null
    let dismissTimer: NodeJS.Timeout | null = null

    $: suggestions = $aiSuggestions

    $: {
        const pending = suggestions.find((s) => s.action === "present")
        if (pending && !show) {
            currentSuggestion = pending
            show = true
            if (dismissTimer) clearTimeout(dismissTimer)
            dismissTimer = setTimeout(() => skip(), 8000)
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
            <div class="approve-body">
                <div class="detected">
                    <strong>{currentSuggestion.content}</strong>
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
        top: 60px;
        right: 20px;
        width: 320px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
        from { transform: translateX(20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    .approve-card {
        background: var(--primary-darkest);
        border: 1px solid var(--primary-lighter);
        border-radius: 6px;
        padding: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .approve-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .detected {
        font-size: 1.1em;
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