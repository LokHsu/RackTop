const CARD_GAP = 12

export function fitCardLayout(availableWidth: number, baseWidth: number, maximum: number) {
  const available = Math.max(0, availableWidth)
  let columns = Math.max(1, Math.min(maximum, Math.floor((available + CARD_GAP) / (baseWidth + CARD_GAP))))
  const widthFor = (count: number) => Math.max(0, (available - (count - 1) * CARD_GAP) / count)
  // Prefer baseline-size columns; compress an extra column only when the
  // existing columns would otherwise exceed the stretch limit.
  if (columns < maximum && widthFor(columns) > baseWidth * 1.2 && widthFor(columns + 1) >= baseWidth * 0.8) columns += 1
  const cardWidth = Math.min(baseWidth * 1.2, widthFor(columns))
  return { columns, cardWidth, pageWidth: columns * cardWidth + (columns - 1) * CARD_GAP }
}
