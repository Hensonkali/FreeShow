import { describe, expect, it } from "vitest"
import type { AiDecisionLog } from "../../../types/ai/Ai"
import { decisionSignature, formatDecisionLine, shouldSkipDuplicate } from "./decisionLogCore"

const base: AiDecisionLog = { t: 1000, heard: "john three sixteen", detector: "reference", ref: "John 3:16", confidence: 98, action: "suggested", reason: "ask_mode" }

describe("decisionSignature", () => {
    it("covers action, verse, reason and detector", () => {
        expect(decisionSignature(base)).toBe("suggested|John 3:16|ask_mode|reference")
    })
})

describe("shouldSkipDuplicate", () => {
    it("collapses identical decisions inside the window", () => {
        const first: AiDecisionLog = { ...base, t: 1000 }
        const repeat: AiDecisionLog = { ...base, t: 1000 + 10000 }
        const later: AiDecisionLog = { ...base, t: 1000 + 60000 }
        expect(shouldSkipDuplicate(first, 1000)).toBe(false)
        expect(shouldSkipDuplicate(repeat, 11000)).toBe(true)
        expect(shouldSkipDuplicate(later, 61000)).toBe(false)
    })

    it("treats a different outcome as a new decision", () => {
        expect(shouldSkipDuplicate({ ...base, t: 2000 }, 2000)).toBe(false)
        expect(shouldSkipDuplicate({ ...base, t: 3000, action: "presented", reason: "auto_high" }, 3000)).toBe(false)
    })

    it("always logs user overrides", () => {
        const override: AiDecisionLog = { ...base, t: 4000, action: "override_presented" }
        expect(shouldSkipDuplicate(override, 4000)).toBe(false)
        expect(shouldSkipDuplicate({ ...override, t: 5000 }, 5000)).toBe(false)
    })
})

describe("formatDecisionLine", () => {
    it("emits one JSON object per line", () => {
        const line = formatDecisionLine(base)
        expect(line.includes("\n")).toBe(false)
        expect(JSON.parse(line)).toEqual(base)
    })
})
