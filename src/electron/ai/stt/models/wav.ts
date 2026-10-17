// Minimal 16-bit PCM WAV writer (pure functions, no Electron imports).

export interface WavParts {
    dataBytes: number
    sampleRate: number
}

// 44-byte PCM WAV header for 16-bit mono audio
export function buildWavHeader({ dataBytes, sampleRate }: WavParts): Buffer {
    const header = Buffer.alloc(44)
    header.write("RIFF", 0)
    header.writeUInt32LE(36 + dataBytes, 4)
    header.write("WAVE", 8)
    header.write("fmt ", 12)
    header.writeUInt32LE(16, 16) // fmt chunk size
    header.writeUInt16LE(1, 20) // PCM
    header.writeUInt16LE(1, 22) // mono
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(sampleRate * 2, 28) // byte rate
    header.writeUInt16LE(2, 32) // block align
    header.writeUInt16LE(16, 34) // bits per sample
    header.write("data", 36)
    header.writeUInt32LE(dataBytes, 40)
    return header
}
