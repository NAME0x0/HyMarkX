const URL_SAFE_ASCII = /^[A-Za-z0-9\-_.~!*'();:@&=+$,/?#%]$/

/** Escapes text for HTML text and quoted-attribute positions. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function percentByte(value: number): string {
  return `%${value.toString(16).toUpperCase().padStart(2, '0')}`
}

function encodeCodePoint(value: number): string {
  const codePoint = value >= 0xd800 && value <= 0xdfff ? 0xfffd : value
  if (codePoint <= 0x7f) {
    return percentByte(codePoint)
  }
  if (codePoint <= 0x7ff) {
    return percentByte(0xc0 | (codePoint >> 6)) + percentByte(0x80 | (codePoint & 0x3f))
  }
  if (codePoint <= 0xffff) {
    return (
      percentByte(0xe0 | (codePoint >> 12)) +
      percentByte(0x80 | ((codePoint >> 6) & 0x3f)) +
      percentByte(0x80 | (codePoint & 0x3f))
    )
  }
  return (
    percentByte(0xf0 | (codePoint >> 18)) +
    percentByte(0x80 | ((codePoint >> 12) & 0x3f)) +
    percentByte(0x80 | ((codePoint >> 6) & 0x3f)) +
    percentByte(0x80 | (codePoint & 0x3f))
  )
}

/** Percent-encodes a URL using the byte-level set used by the CommonMark reference output. */
export function encodeUrl(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) {
      continue
    }
    const character = String.fromCodePoint(codePoint)
    if (codePoint <= 0x7f && URL_SAFE_ASCII.test(character)) {
      output += character
    } else {
      output += encodeCodePoint(codePoint)
    }
    if (codePoint > 0xffff) {
      index += 1
    }
  }
  return output
}
