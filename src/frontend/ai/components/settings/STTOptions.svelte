<script lang="ts">
    import { Main } from "../../../../types/IPC/Main"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { requestMain } from "../../../IPC/main"
    import { AudioMicrophone } from "../../../audio/audioMicrophone"
    import T from "../../../components/helpers/T.svelte"
    import Title from "../../../components/input/Title.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { ai, mediaDownloads } from "../../../stores"
    import { downloadNemotronModel } from "../../setup/nemotronSetup"
    import { formatDownloadedMb, getDownloadPercent } from "../../setup/nemotronUiState"
    import { resolveSttEngine, SpeechToText } from "../../stt/stt"

    $: options = $ai.stt || {}

    function updateValue(key: string, value: any) {
        ai.update((a) => {
            if (!a.stt) a.stt = {}
            a.stt[key] = value

            return a
        })
    }

    // STATUS

    let status: EngineStatus | null = null
    $: if (selectedEngine) getStatus()
    async function getStatus() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: selectedEngine })
        status = result?.[selectedEngine] || null

        if (status?.ready) getMicrophones()
    }

    // update status every time a download finishes
    let downloadingCount = 0
    $: currentlyDownloading = $mediaDownloads
    $: if (!status?.ready && currentlyDownloading) {
        if (currentlyDownloading.size < downloadingCount) getStatus()
        downloadingCount = currentlyDownloading.size
    }

    // MODEL DOWNLOAD (inline, same engine as the model manager popup)

    $: modelDownload = $mediaDownloads.get("nemotron")
    $: isDownloading = downloadStarted || modelDownload?.status === "downloading"
    $: percent = getDownloadPercent(modelDownload)
    $: downloadedMb = formatDownloadedMb(modelDownload)

    let downloadStarted = false
    let downloadFailed = false
    $: if (modelDownload?.status === "error") {
        downloadStarted = false
        downloadFailed = true
    }

    async function downloadModel() {
        if (downloadStarted) return
        downloadFailed = false
        downloadStarted = true

        const ok = await downloadNemotronModel()
        downloadStarted = false
        if (!ok) downloadFailed = true

        getStatus()
    }

    // MICS

    let microphones: { value: string; label: string }[] = []
    function getMicrophones() {
        AudioMicrophone.getList().then(async (devices) => {
            microphones = devices.map((device) => ({ value: device.deviceId, label: device.label }))

            // auto select the SYSTEM default input (the first listed device can be e.g. a continuity iPhone)
            if (!options.micDeviceId && devices.length) {
                const deviceId = await SpeechToText.resolveMicDeviceId("")
                if (deviceId) updateValue("micDeviceId", deviceId)
            }
        })
    }

    // const sttEngines = {
    //     nemotron: { label: "Nemotron" }
    // }
    $: selectedEngine = $ai.stt?.engine || resolveSttEngine()
</script>

<Title label="ai.transcription" icon="microphone" />

<!-- Currently not needed as there's just one engine -->
<!-- <InputRow>
    <MaterialButton
        title="titlebar.edit"
        icon="edit"
        style="width: 100%;"
        on:click={() => {
            popupData.set({ mode: "transcription" })
            activePopup.set("ai_model_manager")
        }}
    >
        <T id="ai.engine" />: <span style="font-weight: bold;">{sttEngines[selectedEngine]?.label}</span>
    </MaterialButton>
</InputRow> -->

{#if status?.ready}
    <MaterialDropdown label="midi.input" options={microphones} value={options.micDeviceId || ""} on:change={(e) => updateValue("micDeviceId", e.detail)} />
{:else if isDownloading}
    <div class="download-progress">
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%;" />
        </div>
        <div class="progress-text"><T id="ai.model_downloading" /> {percent}%{downloadedMb ? ` — ${downloadedMb}` : ""}</div>
    </div>
{:else if status}
    {#if status.reason === "unsupported"}
        <Tip type="warning" value="ai.model_unsupported" />
    {:else}
        {#if status.reason === "outdated"}
            <Tip type="warning" value="ai.model_outdated" />
        {:else}
            <Tip type="warning" value="ai.model_missing_short" />
        {/if}
        {#if downloadFailed}
            <Tip type="warning" value="ai.model_download_failed" />
        {/if}
        <div style="display: flex;gap: 8px;">
            <MaterialButton variant="outlined" icon="download" style="flex: 1;" on:click={downloadModel}>
                {#if status.reason === "outdated"}
                    <T id="ai.model_update" />
                {:else if downloadFailed}
                    <T id="ai.model_retry" />
                {:else}
                    <T id="ai.model_download" />
                {/if}
            </MaterialButton>
        </div>
    {/if}
{:else}
    <Tip type="warning" value="ai.model_missing_short" />
{/if}

<style>
    .download-progress {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 8px 0;
    }

    .progress-bar {
        width: 100%;
        height: 6px;
        background-color: var(--primary-darkest);
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8000f0 0%, var(--secondary) 100%);
        transition: width 0.3s ease;
        border-radius: 3px;
    }

    .progress-text {
        font-size: 0.75em;
        opacity: 0.7;
        text-align: right;
    }
</style>
