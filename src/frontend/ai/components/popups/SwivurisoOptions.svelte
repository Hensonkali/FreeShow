<script lang="ts">
    import { onMount } from "svelte"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { Main } from "../../../../types/IPC/Main"
    import T from "../../../components/helpers/T.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { requestMain } from "../../../IPC/main"
    import { mediaDownloads } from "../../../stores"

    const engine = "swivuriso"

    let status: EngineStatus | null = null
    async function getStatus() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: engine })
        status = result?.[engine] || null
    }
    onMount(getStatus)

    // the raw 3.24 GB safetensors download is only useful for offline conversion;
    // the engine itself needs whisper-cli + model-ggml.bin placed manually (see research)
    $: modelDownload = $mediaDownloads.get("swivuriso")
    $: percent = modelDownload?.total ? Math.min(100, Math.floor((modelDownload.progress / modelDownload.total) * 100)) : 0

    let downloadStarted = false
    async function downloadRawModel() {
        if (downloadStarted || modelDownload?.status === "downloading") return
        downloadStarted = true
        await requestMain(Main.AI_SETUP, { action: "download", engineId: "swivuriso" }, undefined, 60 * 60 * 1000)
        downloadStarted = false
        getStatus()
    }
</script>

{#if !status}
    <div style="display: flex;justify-content: center;padding: 10px;">
        <Loader />
    </div>
{:else if status.ready}
    <Tip type="info" value="ai.swivuriso_ready" />
{:else}
    <Tip type="warning" value="ai.swivuriso_missing" />
    <div class="swivuriso-steps">
        <T id="ai.swivuriso_steps" />
    </div>

    {#if modelDownload?.status === "downloading"}
        <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%;" />
        </div>
        <div class="progress-text"><T id="ai.model_downloading" /> {percent}%</div>
    {:else}
        <MaterialButton variant="outlined" icon="download" style="flex: 1;" on:click={downloadRawModel}>
            <T id="ai.swivuriso_download_raw" />
        </MaterialButton>
    {/if}
{/if}

<style>
    .swivuriso-steps {
        font-size: 0.8em;
        opacity: 0.8;
        padding: 0 6px;
        white-space: initial;
    }

    .progress-bar {
        width: 100%;
        height: 6px;
        background-color: var(--primary-darkest);
        border-radius: 3px;
        overflow: hidden;
        margin-top: 8px;
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
