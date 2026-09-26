/** Original panel viewport reconciliation, extended for measured card dimensions. */
export function popupPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  cardWidth = 328,
  cardHeight = 242
) {
  const margin = 12
  const left = Math.max(
    margin,
    Math.min(x + 12, viewportWidth - cardWidth - margin)
  )
  const below = y + 18
  const preferred =
    below + cardHeight + margin <= viewportHeight ? below : y - cardHeight - 18
  const top = Math.max(
    margin,
    Math.min(preferred, viewportHeight - cardHeight - margin)
  )
  return { left, top }
}
