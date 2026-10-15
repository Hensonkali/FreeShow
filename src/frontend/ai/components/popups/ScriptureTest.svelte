<script lang="ts">
    import { get } from "svelte/store"
    import type { MatchResult } from "../../../../types/ai/Ai"
    import { keysToID } from "../../../components/helpers/array"
    import T from "../../../components/helpers/T.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialTextarea from "../../../components/inputs/MaterialTextarea.svelte"
    import MaterialTextInput from "../../../components/inputs/MaterialTextInput.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { drawerTabsData, scriptures } from "../../../stores"
    import { BibleCacheManager } from "../../scripture/BibleCacheManager"
    import ConfidenceMeter from "../floating/ConfidenceMeter.svelte"

    // local Bibles only (detection never runs on API Bibles)
    $: bibles = keysToID($scriptures)
        .filter((a) => !a.api && !a.collection)
        .map((a) => ({ value: a.id, label: a.customName || a.name || a.id }))

    let bibleId = get(drawerTabsData)?.scripture?.activeSubTab || ""
    $: if (!bibleId && bibles.length) bibleId = bibles[0].value

    let heardText = ""
    let currentRef = ""
    let running = false
    let result: MatchResult | null | "none" = null

    async function detect() {
        if (!heardText.trim() || !bibleId || running) return
        running = true
        result = null

        const detector = await BibleCacheManager.getCache(bibleId)
        result = (await detector?.search(heardText, currentRef.trim())) ?? "none"
        running = false
    }
</script>

{#if !bibles.length}
    <Tip type="warning" value="ai.test_no_bible" />
{:else}
    <MaterialDropdown label="ai.test_bible" options={bibles} value={bibleId} on:change={(e) => ((bibleId = e.detail), (result = null))} />
    <MaterialTextarea label="ai.test_heard" value={heardText} rows={4} on:input={(e) => (heardText = e.detail)} />
    <MaterialTextInput label="ai.test_current_ref" value={currentRef} placeholder="John 3:16" on:input={(e) => (currentRef = e.detail)} />

    <div style="display: flex;gap: 8px;margin-top: 8px;">
        <MaterialButton variant="outlined" icon="search" style="flex: 1;" disabled={!heardText.trim() || running} on:click={detect}>
            <T id="ai.test_detect" />
        </MaterialButton>
    </div>

    {#if running}
        <div style="display: flex;justify-content: center;padding: 10px;">
            <Loader />
        </div>
    {:else if result === "none"}
        <Tip type="info" value="ai.test_no_match" />
    {:else if result}
        <div class="test-result">
            <div class="test-row">
                <span class="test-label"><T id="ai.test_detector" /></span>
                <span>{result.detector ? result.detector.replace(/_/g, " ") : "—"}</span>
            </div>
            <div class="test-row">
                <span class="test-label"><T id="ai.test_verse" /></span>
                <span class="test-verse">{result.content}</span>
            </div>
            <div class="test-row">
                <span class="test-label"><T id="ai.test_confidence" /></span>
                <ConfidenceMeter confidence={result.confidence} />
                <span>{result.confidence}%</span>
            </div>
            {#if result.scriptureTranslation}
                <div class="test-row">
                    <span class="test-label"><T id="ai.test_translation" /></span>
                    <span>{result.scriptureTranslation}</span>
                </div>
            {/if}
        </div>
    {/if}
{/if}

<style>
    .test-result {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 12px;
        padding: 10px 12px;
        background-color: var(--primary-darkest);
        border-radius: 4px;
    }

    .test-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.9em;
    }

    .test-label {
        min-width: 110px;
        opacity: 0.6;
    }

    .test-verse {
        font-weight: bold;
    }
</style>
