import fs from "fs"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { MANAGED_MODELS } from "./models"

// models.json is the human/machine-readable mirror of the runtime manifest.
// These tests fail if the two ever drift apart (URLs, hashes, sizes, licences).
describe("models manifest", () => {
    const manifestPath = fileURLToPath(new URL("./models.json", import.meta.url))
    const recorded = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

    it("lists exactly the managed models", () => {
        expect(recorded.models).toEqual(MANAGED_MODELS)
    })

    it("only auto-downloads openly licensed models", () => {
        for (const model of MANAGED_MODELS) {
            if (!model.autoDownload) continue
            expect(model.license, `${model.id} licence`).toBeTruthy()
            expect(model.licenseUrl, `${model.id} licence URL`).toMatch(/^https?:\/\//)
        }
    })

    it("has a positive size for every file and a matching total", () => {
        for (const model of MANAGED_MODELS) {
            expect(model.totalBytes).toBeGreaterThan(0)
            for (const file of model.files) {
                expect(file.bytes, `${model.id}/${file.file} size`).toBeGreaterThan(0)
                expect(file.sha256, `${model.id}/${file.file} hash`).toMatch(/^[0-9a-f]{64}$/)
                expect(file.url, `${model.id}/${file.file} URL`).toMatch(/^https:\/\//)
            }
            const summed = model.files.reduce((total, file) => total + file.bytes, 0)
            expect(Math.abs(summed - model.totalBytes) / model.totalBytes, `${model.id} total`).toBeLessThan(0.01)
        }
    })
})
