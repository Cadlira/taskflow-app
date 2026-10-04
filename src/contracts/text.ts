/** Tamanho em bytes UTF-8 de uma string JS, sem depender de APIs do Node ou do DOM. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit < 0x80) {
      bytes += 1
    } else if (unit < 0x800) {
      bytes += 2
    } else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

/**
 * Bytes UTF-8 que `JSON.stringify` produz para o conteúdo de uma string (sem as aspas),
 * considerando escaping de aspas, barra invertida, controles e surrogates isolados.
 * Retorna também o índice final alcançado sem ultrapassar `maxBytes` nem dividir um par
 * surrogate, para fragmentar texto sem quebrar caracteres.
 */
export function measureJsonStringContent(
  text: string,
  start: number,
  maxBytes: number,
): { end: number; bytes: number } {
  let bytes = 0
  let index = start

  while (index < text.length) {
    const unit = text.charCodeAt(index)
    let cost: number
    let width = 1

    if (unit === 0x22 || unit === 0x5c) {
      cost = 2
    } else if (unit < 0x20) {
      cost = unit === 0x08 || unit === 0x09 || unit === 0x0a || unit === 0x0c || unit === 0x0d ? 2 : 6
    } else if (unit < 0x80) {
      cost = 1
    } else if (unit < 0x800) {
      cost = 2
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0
      if (next >= 0xdc00 && next <= 0xdfff) {
        cost = 4
        width = 2
      } else {
        cost = 6
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      cost = 6
    } else {
      cost = 3
    }

    if (bytes + cost > maxBytes) break
    bytes += cost
    index += width
  }

  return { end: index, bytes }
}
