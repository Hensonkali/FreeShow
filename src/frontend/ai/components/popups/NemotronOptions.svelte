<script lang="ts">
    import { onMount } from "svelte"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import T from "../../../components/helpers/T.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { mediaDownloads } from "../../../stores"
    import { cancelNemotronDownload, deleteNemotronModel, downloadNemotronModel, getNemotronStatus } from "../../setup/nemotronSetup"
    import { formatDownloadedMb, getDownloadPercent, resolveNemotronUiState } from "../../setup/nemotronUiState"

    // STATUS

    let status: EngineStatus | null = null
    async function refreshStatus() {
        status = await getNemotronStatus()
    }

    onMount(refreshStatus)

    // DOWNLOADS

    // the whole multi-file download reports under one stable "nemotron" key
    $: modelDownload = $mediaDownloads.get("nemotron")
    $: uiState = resolveNemotronUiState(status, modelDownload, downloadStarted)
    $: percent = getDownloadPercent(modelDownload)
    $: downloadedMb = formatDownloadedMb(modelDownload)

    // a failed download only shows in the store for 2 seconds, so latch it locally
    let downloadFailed = false
    $: if (modelDownload?.status === "error") {
        downloadStarted = false
        if (!cancelledByUser) downloadFailed = true
        cancelledByUser = false
    }
    $: showError = uiState === "error" || downloadFailed

    // NEMOTRON MODEL

    let downloadStarted = false
    let cancelledByUser = false
    async function downloadModel() {
        if (downloadStarted) return
        downloadFailed = false
        cancelledByUser = false
        downloadStarted = true

        const ok = await downloadNemotronModel()
        downloadStarted = false
        if (!ok) downloadFailed = true

        refreshStatus()
    }

    function cancelDownload() {
        cancelledByUser = true
        downloadFailed = false
        downloadStarted = false
        cancelNemotronDownload()
    }

    function removeModel() {
        deleteNemotronModel()
        setTimeout(refreshStatus, 300)
    }
</script>

{#if uiState === "loading"}
    <div style="display: flex;justify-content: center;padding: 10px;">
        <Loader />
    </div>
{:else if uiState === "ready"}
    <Tip type="info" value="ai.model_ready" />
    <div style="display: flex;gap: 8px;">
        <MaterialButton variant="outlined" icon="delete" style="flex: 1;" on:click={removeModel}>
            <T id="ai.model_delete" />
        </MaterialButton>
    </div>
{:else if uiState === "unsupported"}
    <Tip type="warning" value="ai.model_unsupported" />
{:else}
    {#if uiState === "outdated"}
        <Tip type="warning" value="ai.model_outdated" />
    {:else}
        <Tip type="info" value="ai.model_missing" />
    {/if}

    {#if uiState === "downloading"}
        <div class="download-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: {percent}%;" />
            </div>
            <div class="progress-text">{percent}%{downloadedMb ? ` — ${downloadedMb}` : ""}</div>
        </div>
        <div style="display: flex;gap: 8px;">
            <MaterialButton variant="outlined" icon="close" style="flex: 1;" on:click={cancelDownload}>
                <T id="ai.model_cancel" />
            </MaterialButton>
        </div>
    {:else}
        {#if showError}
            <Tip type="warning" value="ai.model_download_failed" />
        {/if}
        <div style="display: flex;gap: 8px;">
            <MaterialButton variant="outlined" icon="download" style="flex: 1;" on:click={downloadModel}>
                {#if uiState === "outdated"}
                    <T id="ai.model_update" />
                {:else if showError}
                    <T id="ai.model_retry" />
                {:else}
                    <T id="ai.model_download" />
                {/if}
            </MaterialButton>
            {#if uiState === "outdated" || showError}
                <MaterialButton variant="outlined" icon="delete" title="ai.model_delete" on:click={removeModel} />
            {/if}
        </div>
    {/if}
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
