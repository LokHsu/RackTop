// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { syncLinuxWindowShape } from './linuxWindowShape'

it('rounds Linux floating windows and squares maximized/fullscreen windows', async () => {
  let resize = () => {}
  const window = {
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    onResized: vi.fn(async (handler: () => void) => { resize = handler; return vi.fn() }),
  }
  const element = document.createElement('div')
  await syncLinuxWindowShape('linux', window, element)
  expect(element.dataset.windowSquare).toBe('false')
  window.isMaximized.mockResolvedValue(true)
  resize()
  await vi.waitFor(() => expect(element.dataset.windowSquare).toBe('true'))
  window.isMaximized.mockResolvedValue(false)
  window.isFullscreen.mockResolvedValue(true)
  resize()
  await vi.waitFor(() => expect(element.dataset.windowSquare).toBe('true'))
  window.isFullscreen.mockResolvedValue(false)
  resize()
  await vi.waitFor(() => expect(element.dataset.windowSquare).toBe('false'))
})

it.each(['windows', 'macos', 'web'] as const)('does not touch %s window state or DOM', async (platform) => {
  const window = { isMaximized: vi.fn(), isFullscreen: vi.fn(), onResized: vi.fn() }
  const element = document.createElement('div')
  await syncLinuxWindowShape(platform, window, element)
  expect(window.onResized).not.toHaveBeenCalled()
  expect(window.isMaximized).not.toHaveBeenCalled()
  expect(window.isFullscreen).not.toHaveBeenCalled()
  expect(element.hasAttribute('data-window-square')).toBe(false)
})
