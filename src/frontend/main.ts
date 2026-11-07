// ----- FreeShow -----
// Svelte app entry point

import "svelte"
import App from "./App.svelte"

// offline edition: no error reporting service — errors are only written to the local log

const app = new App({ target: document.body })

export default app
