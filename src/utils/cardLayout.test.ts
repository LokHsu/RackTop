import { expect, it } from 'vitest'
import { fitCardLayout } from './cardLayout'

it('adds a baseline-size column as soon as it fits instead of stretching fewer columns', () => {
  expect(fitCardLayout(1578, 518, 5)).toEqual({ columns: 3, cardWidth: 518, pageWidth: 1578 })
  expect(fitCardLayout(2108, 518, 5)).toEqual({ columns: 4, cardWidth: 518, pageWidth: 2108 })
})

it('fills the page within the adjustment range and compresses before dropping a column', () => {
  expect(fitCardLayout(1047, 518, 3)).toEqual({ columns: 2, cardWidth: 517.5, pageWidth: 1047 })
  expect(fitCardLayout(1200, 518, 3)).toEqual({ columns: 2, cardWidth: 594, pageWidth: 1200 })
  expect(fitCardLayout(850, 518, 3)).toEqual({ columns: 2, cardWidth: 419, pageWidth: 850 })
})

it('bounds stretching at transitions and at the configured column maximum', () => {
  expect(fitCardLayout(800, 518, 3)).toEqual({ columns: 1, cardWidth: 621.6, pageWidth: 621.6 })
  expect(fitCardLayout(3200, 518, 2)).toEqual({ columns: 2, cardWidth: 621.6, pageWidth: 1255.2 })
  expect(fitCardLayout(300, 518, 3)).toEqual({ columns: 1, cardWidth: 300, pageWidth: 300 })
})

it('stays within the limits across resize thresholds and never overflows narrow windows', () => {
  for (const maximum of [2, 3, 4, 5]) {
    for (let available = 0; available <= 4000; available++) {
      const layout = fitCardLayout(available, 518, maximum)
      expect(layout.columns).toBeLessThanOrEqual(maximum)
      expect(layout.pageWidth).toBeLessThanOrEqual(available + 0.001)
      expect(layout.cardWidth).toBeLessThanOrEqual(518 * 1.2)
      if (available >= 518 * 0.8) expect(layout.cardWidth).toBeGreaterThanOrEqual(518 * 0.8)
      const baselineColumns = Math.min(maximum, Math.floor((available + 12) / 530))
      expect(layout.columns).toBeGreaterThanOrEqual(baselineColumns)
    }
  }
})
