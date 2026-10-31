<script lang="ts">
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import T from "../../../components/helpers/T.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { activePopup, ai, popupData, sttTempDisabled } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import AutoScriptureOptions from "./AutoScriptureOptions.svelte"
    import STTOptions from "./STTOptions.svelte"

    $: isEnabled = $ai.enabled

    function updateValue(key: string, value: any) {
        ai.update((a) => {
            a[key] = value
            return a
        })

        if (key === "enabled" && value) {
            sttTempDisabled.set(false)
            popupData.set({ mode: "setup" })
            activePopup.set("ai_model_manager")
        }
    }
</script>

<div class="experimental">EXPERIMENTAL!</div>

<MaterialToggleSwitch label={translateText("actions.enable_specific", null, ["settings.ai"])} checked={isEnabled} on:change={(e) => updateValue("enabled", e.detail)} />

{#if isEnabled}
    <STTOptions />

    <AutoScriptureOptions />

    <MaterialToggleSwitch label={translateText("ai.shadow_mode")} checked={$ai.shadowMode} on:change={(e) => updateValue("shadowMode", e.detail)} />
    {#if $ai.shadowMode}
        <Tip type="info" value="ai.shadow_mode_hint" top={10} />
    {/if}

    <MaterialToggleSwitch label={translateText("ai.lock_output")} checked={$ai.lockOutput} on:change={(e) => updateValue("lockOutput", e.detail)} />
    {#if $ai.lockOutput}
        <Tip type="warning" value="ai.lock_output_hint" top={10} />
    {/if}

    <MaterialToggleSwitch label={translateText("ai.paraphrase_search")} checked={$ai.paraphraseSearch !== false} on:change={(e) => updateValue("paraphraseSearch", e.detail)} />
    {#if $ai.paraphraseSearch !== false}
        <Tip type="info" value="ai.paraphrase_search_hint" top={10} />
    {/if}

    <MaterialButton variant="outlined" icon="search" style="width: 100%;margin-top: 10px;" on:click={() => activePopup.set("ai_scripture_test")}>
        <T id="ai.test_open" />
    </MaterialButton>

    <!-- TODO: auto lyrics & more -->
{:else}
    <Tip type="info" value="ai.hint" top={20} />
    <Tip type="warning" value="ai.privacy_details" top={10} />
{/if}

<style>
    .experimental {
        color: red;
        text-align: center;
        font-weight: bold;
        margin-bottom: 20px;
    }
</style>
