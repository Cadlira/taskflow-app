import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(projectRoot, 'assets', 'taskflow-icon.svg')
const outputPath = path.join(projectRoot, 'build', 'icons', 'taskflow.ico')
const sizes = [16, 24, 32, 48, 256]

function createIcon(pngImages) {
  const directorySize = 6 + pngImages.length * 16
  const totalSize = directorySize + pngImages.reduce((total, image) => total + image.data.length, 0)
  const icon = Buffer.alloc(totalSize)
  icon.writeUInt16LE(0, 0)
  icon.writeUInt16LE(1, 2)
  icon.writeUInt16LE(pngImages.length, 4)

  let offset = directorySize
  pngImages.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16
    icon.writeUInt8(size === 256 ? 0 : size, entryOffset)
    icon.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    icon.writeUInt8(0, entryOffset + 2)
    icon.writeUInt8(0, entryOffset + 3)
    icon.writeUInt16LE(1, entryOffset + 4)
    icon.writeUInt16LE(32, entryOffset + 6)
    icon.writeUInt32LE(data.length, entryOffset + 8)
    icon.writeUInt32LE(offset, entryOffset + 12)
    data.copy(icon, offset)
    offset += data.length
  })

  return icon
}

export function deriveWindowsIcon(svg) {
  if (!/^<svg\b/.test(svg.trim()) || !svg.includes('viewBox="0 0 24 24"')) {
    throw new Error('The reviewed 24x24 master icon is missing or has changed shape')
  }
  const pngImages = sizes.map((size) => {
    const renderer = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
    })
    const data = renderer.render().asPng()
    if (data.readUInt32BE(16) !== size || data.readUInt32BE(20) !== size) {
      throw new Error(`Unexpected ${size}px PNG output`)
    }
    return { size, data }
  })
  return createIcon(pngImages)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(outputPath, deriveWindowsIcon(await readFile(sourcePath, 'utf8')))
  process.stdout.write(`Generated ${path.relative(projectRoot, outputPath)} (${sizes.join(', ')} px)\n`)
}
