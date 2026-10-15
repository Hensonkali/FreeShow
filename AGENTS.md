# Rules for the agent

This is a fork of FreeShow (Electron, TypeScript, Svelte). Do one step at a time. Commit after each step on branch `my-freeshow`. Run the existing tests and the app after every change and show me the results. Ask before adding any big dependency. Never bundle licensed Bible texts. Explain changes in plain English. Never break existing FreeShow features.

## Working agreement

- **One step at a time** — complete the current step fully before starting the next.
- **Commit after each step** on branch `my-freeshow`.
- **Run the existing tests and the app after every change** and show the results.
- **Ask before adding any big dependency.**
- **Never bundle licensed Bible texts.**
- **Explain changes in plain English.**
- **Never break existing FreeShow features.**

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Run app | `npm start` |
| Unit tests | `npm run test:unit` |
| All tests | `npm test` (unit + playwright + prettier check + svelte-check) |
| Lint | `npm run lint` |
| Format | `npm run format:prettier` |
