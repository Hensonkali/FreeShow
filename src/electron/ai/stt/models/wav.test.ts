import { describe, expect, it } from "vitest"
import { buildWavHeader } from "./wav"

describe("buildWavHeader", () => {
    it("writes a valid 44-byte PCM WAV header for 16 kHz mono", () => {
        const dataBytes = 3200 // 1 second of 16 kHz 16-bit audio
        const header = buildWavHeader({ dataBytes, sampleRate: 16000 })

        expect(header.length).toBe(44)
        expect(header.toString("ascii", 0, 4)).toBe("RIFF")
        expect(header.readUInt32LE(4)).toBe(36 + dataBytes)
        expect(header.toString("ascii", 8, 12)).toBe("WAVE")
        expect(header.toString("ascii", 12, 16)).toBe("fmt ")
        expect(header.readUInt16LE(20)).toBe(1) // PCM
        expect(header.readUInt16LE(22)).toBe(1) // mono
        expect(header.readUInt32LE(24)).toBe(16000) // sample rate
        expect(header.readUInt32LE(28)).toBe(32000) // byte rate
        expect(header.readUInt16LE(32)).toBe(2) // block align
        expect(header.readUInt16LE(34)).toBe(16) // bits
        expect(header.toString("ascii", 36, 40)).toBe("data")
        expect(header.readUInt32LE(40)).toBe(dataBytes)
    })

    it("scales the byte rate with the sample rate", () => {
        const header = buildWavHeader({ dataBytes: 1000, sampleRate: 8000 })
        expect(header.readUInt32LE(24)).toBe(8000)
        expect(header.readUInt32LE(28)).toBe(16000)
    })
})
