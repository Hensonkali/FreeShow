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

    let newPassage = ""

    function addPassage() {
        const p = newPassage.trim()
        if (!p) return
        ai.update((a) => {
            if (!a.servicePassages) a.servicePassages = []
            if (!a.servicePassages.includes(p)) a.servicePassages.push(p)
            return a
        })
        newPassage = ""
    }

    function removePassage(index: number) {
        ai.update((a) => {
            if (a.servicePassages) a.servicePassages.splice(index, 1)
            return a
        })
    }

    function toggleFeature(key: string) {
        ai.update((a) => {
            if (!a.features) a.features = {}
            a.features[key] = !a.features[key]
            return a
        })
    }

    $: noiseGateValue = $ai.stt?.engineOptions?.nemotron?.noiseGateThreshold ?? 0.05

    function setNoiseGate(val: number) {
        ai.update((a) => {
            if (!a.stt) a.stt = {}
            if (!a.stt.engineOptions) a.stt.engineOptions = {}
            if (!a.stt.engineOptions.nemotron) a.stt.engineOptions.nemotron = {}
            a.stt.engineOptions.nemotron.noiseGateThreshold = val
            return a
        })
    }

    function setNoiseGateInput(e: Event) {
        const target = e.target as HTMLInputElement
        setNoiseGate(parseFloat(target.value) / 100)
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

    <div class="ai-feature-group">
        <MaterialToggleSwitch label={translateText("ai.feature_voice")} checked={$ai.features?.voice !== false} on:change={() => toggleFeature("voice")} />
        <MaterialToggleSwitch label={translateText("ai.feature_reference")} checked={$ai.features?.reference !== false} on:change={() => toggleFeature("reference")} />
        <MaterialToggleSwitch label={translateText("ai.feature_content")} checked={$ai.features?.content !== false} on:change={() => toggleFeature("content")} />
        <MaterialToggleSwitch label={translateText("ai.feature_embedding")} checked={$ai.features?.embedding !== false} on:change={() => toggleFeature("embedding")} />
    </div>

    <div class="passage-section">
        <div class="section-title">{translateText("ai.service_passages")}</div>
        <div class="passage-row">
            <input type="text" placeholder="{translateText('ai.service_passage_placeholder')}" bind:value={newPassage} on:keydown={(e) => { if (e.key === "Enter") addPassage() }} />
            <MaterialButton variant="outlined" icon="add" on:click={addPassage} />
        </div>
        {#if $ai.servicePassages?.length}
            <div class="passage-list">
                {#each $ai.servicePassages as passage, i}
                    <div class="passage-item"><span>{passage}</span><MaterialButton variant="outlined" icon="remove" size="small" on:click={() => removePassage(i)} /></div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="noise-gate">
        <div class="noise-gate-row">
            <label style="flex: 1;">{translateText("ai.noise_gate")}</label>
            <span>{Math.round(noiseGateValue * 100)}%</span>
        </div>
        <input type="range" min="0" max="100" step="5" value={noiseGateValue} on:input={setNoiseGateInput} />
    </div>
    <Tip type="info" value="ai.noise_gate_hint" top={10} />

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

    .ai-feature-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 12px 0;
    }

    .passage-section {
        margin: 16px 0;
    }

    .whitelist-blacklist {
        margin: 16px 0;
    }

    .section-title {
        font-weight: bold;
        margin-bottom: 8px;
        font-size: 0.9em;
        opacity: 0.9;
    }

    .passage-row {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }

    .passage-row input {
        flex: 1;
    }

    .passage-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .passage-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    }

    .noise-gate {
        margin: 16px 0;
    }

    .noise-gate-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 0.9em;
    }

    .noise-gate input[type="range"] {
        width: 100%;
    }
</style>