function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0
      const next = Math.min(
        above + 1,
        (previous[rightIndex - 1] ?? 0) + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
      previous[rightIndex] = next
    }
  }
  return previous[right.length] ?? 0
}

/** Returns the single closest case-insensitive candidate within edit distance two. */
export function nearestSuggestion(
  value: string,
  candidates: readonly string[],
): string | undefined {
  let closest: string | undefined
  let closestDistance = 3
  const normalized = value.toLowerCase()
  for (const candidate of candidates) {
    const distance = levenshtein(normalized, candidate.toLowerCase())
    if (distance < closestDistance) {
      closest = candidate
      closestDistance = distance
    }
  }
  return closest
}
