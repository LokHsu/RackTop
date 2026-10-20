// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { DesktopWindowControls } from '../App'
import { api } from '../services/api'
import { getCurrentWindow } from '@tauri-apps/api/window'

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => {
  act(() => root.render(null))
  api.isDesktop = false
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it.each(['linux', 'windows'] as const)('supports %s window controls without triggering titlebar dragging', (platform) => {
  const drag = vi.fn()
  act(() => root.render(<div onMouseDown={drag}><DesktopWindowControls platform={platform} /></div>))
  const buttons = Array.from(container.querySelectorAll('button'))
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['最小化窗口', platform === 'windows' ? '最大化窗口' : '最大化或还原窗口', '关闭窗口'])
  act(() => buttons.forEach(button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))))
  expect(drag).not.toHaveBeenCalled()
  expect(invoke).toHaveBeenCalledTimes(platform === 'windows' ? 3 : 0)
  act(() => buttons.forEach(button => button.click()))
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual(['window_minimize', 'window_toggle_maximize', 'window_close'])
})

it.each(['web', 'macos'] as const)('preserves %s window controls', (platform) => {
  act(() => root.render(<DesktopWindowControls platform={platform} />))
  expect(container.querySelector('button')).toBeNull()
})

it('tracks native Windows maximization including titlebar or system actions and cleans up the listener', async () => {
  api.isDesktop = true
  let resized = () => {}
  const stop = vi.fn()
  const isMaximized = vi.fn().mockResolvedValue(true)
  vi.mocked(getCurrentWindow).mockReturnValue({ isMaximized, onResized: vi.fn(async (handler: () => void) => { resized = handler; return stop }) } as unknown as ReturnType<typeof getCurrentWindow>)
  await act(async () => root.render(<DesktopWindowControls platform="windows" />))
  expect(container.querySelector('[aria-label="还原窗口"] .lucide-copy')).not.toBeNull()
  isMaximized.mockResolvedValue(false)
  await act(async () => resized())
  expect(container.querySelector('[aria-label="最大化窗口"] .lucide-square')).not.toBeNull()
  isMaximized.mockResolvedValue(true)
  await act(async () => resized())
  expect(container.querySelector('[aria-label="还原窗口"]')).not.toBeNull()
  await act(async () => root.render(null))
  expect(stop).toHaveBeenCalledOnce()
})

it('releases a Windows listener registered after unmount', async () => {
  api.isDesktop = true
  let complete!: (stop: () => void) => void
  const stop = vi.fn()
  vi.mocked(getCurrentWindow).mockReturnValue({ onResized: () => new Promise(resolve => { complete = resolve }) } as unknown as ReturnType<typeof getCurrentWindow>)
  await act(async () => root.render(<DesktopWindowControls platform="windows" />))
  await act(async () => root.render(null))
  await act(async () => complete(stop))
  expect(stop).toHaveBeenCalledOnce()
})
