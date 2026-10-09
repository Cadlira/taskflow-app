// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit'
import { deriveWindowsIcon } from '../../scripts/generate-windows-icon.mjs'
import { inspectIconFrames, verifyPeIcon } from '../../scripts/windows-icon.mjs'

const master = readFileSync('assets/taskflow-icon.svg', 'utf8')
const ico = deriveWindowsIcon(master)
function pe(groupId: number, count = 5): Buffer {
  const executable = NtExecutable.createEmpty(false)
  const resources = NtExecutableResource.from(executable)
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, groupId, 0, Data.IconFile.from(ico).icons.slice(0, count).map(item => item.data))
  resources.outputResource(executable)
  return Buffer.from(executable.generate())
}
describe('identidade de ícones Windows — W07 local', () => {
  it('conserva derivação do master e cinco imagens exatas em exe/Setup/uninstaller', () => {
    expect(readFileSync('build/icons/taskflow.ico')).toEqual(ico)
    expect(inspectIconFrames(ico).map(frame => frame.size)).toEqual([16, 24, 32, 48, 256])
    for (const group of [1, 103]) expect(verifyPeIcon(pe(group), ico, group).sizes).toEqual([16, 24, 32, 48, 256])
  })
  it('recusa ICO truncado, offsets sobrepostos e tamanho divergente', () => {
    expect(() => inspectIconFrames(ico.subarray(0, ico.length - 1))).toThrow()
    const overlap = Buffer.from(ico)
    overlap.writeUInt32LE(86, 6 + 16 + 12)
    expect(() => inspectIconFrames(overlap)).toThrow('FRAME_INVALID')
    const wrongSize = Buffer.from(ico)
    wrongSize[6] = 17
    expect(() => inspectIconFrames(wrongSize)).toThrow('FRAME_INVALID')
    const corrupted = Buffer.from(ico)
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1
    expect(() => verifyPeIcon(pe(1), corrupted, 1)).toThrow('PE_BYTES_MISMATCH')
  })
  it('recusa grupo/frame ausente e alteração do PNG no recurso PE', () => {
    expect(() => verifyPeIcon(pe(103), ico, 1)).toThrow('GROUP_MISSING')
    expect(() => verifyPeIcon(pe(1, 4), ico, 1)).toThrow('FRAMES_MISSING')
    const executable = NtExecutable.from(pe(1))
    const resources = NtExecutableResource.from(executable)
    const resource = resources.entries.find(entry => entry.type === 3)!
    const corrupted = Buffer.from(resource.bin)
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1
    resource.bin = Uint8Array.from(corrupted).buffer
    resources.outputResource(executable)
    expect(() => verifyPeIcon(Buffer.from(executable.generate()), ico, 1)).toThrow('PE_BYTES_MISMATCH')
  })
})
