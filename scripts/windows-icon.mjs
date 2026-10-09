import { createHash } from 'node:crypto'
import { NtExecutable, NtExecutableResource, Resource } from 'resedit'

export const WINDOWS_ICON_SIZES = [16, 24, 32, 48, 256]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
/** ICO com os cinco PNGs: offsets contíguos, sem sobreposição ou sobra. */
export function inspectIconFrames(icon) {
  if (icon.length < 86 || icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1 || icon.readUInt16LE(4) !== 5) throw new Error('WINDOWS_ICON_DIRECTORY_INVALID')
  let cursor = 86
  const frames = WINDOWS_ICON_SIZES.map((size, index) => {
    const entry = 6 + index * 16
    const length = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12)
    if ((icon[entry] || 256) !== size || (icon[entry + 1] || 256) !== size || icon.readUInt16LE(entry + 6) !== 32 || offset !== cursor || length < 24 || offset + length > icon.length) throw new Error('WINDOWS_ICON_FRAME_INVALID')
    const bytes = icon.subarray(offset, offset + length)
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error('WINDOWS_ICON_PNG_INVALID')
    cursor += length
    return { size, sha256: hash(bytes) }
  })
  if (cursor !== icon.length) throw new Error('WINDOWS_ICON_TRAILING_BYTES')
  return frames
}
/** Compara RT_GROUP_ICON/RT_ICON do PE com os cinco PNGs exatos do ICO. */
export function verifyPeIcon(bytes, icon, groupId) {
  const frames = inspectIconFrames(icon)
  const entries = NtExecutableResource.from(NtExecutable.from(bytes)).entries
  const groups = Resource.IconGroupEntry.fromEntries(entries).filter(group => group.id === groupId)
  if (!groups.length) throw new Error('WINDOWS_ICON_PE_GROUP_MISSING')
  for (const group of groups) {
    if (group.icons.length !== frames.length) throw new Error('WINDOWS_ICON_PE_FRAMES_MISSING')
    for (const [index, frame] of frames.entries()) {
      const item = group.icons[index]
      const resource = entries.find(entry => entry.type === 3 && entry.id === item.iconID && entry.lang === group.lang)
      if ((item.width || 256) !== frame.size || (item.height || 256) !== frame.size || !resource || hash(Buffer.from(resource.bin)) !== frame.sha256) throw new Error('WINDOWS_ICON_PE_BYTES_MISMATCH')
    }
  }
  return { groupId, languages: groups.length, sizes: frames.map(frame => frame.size) }
}
