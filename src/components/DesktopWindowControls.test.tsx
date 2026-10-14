// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { DesktopWindowControls } from '../App'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => {
  act(() => root.render(null))
  vi.clearAllMocks()
})

it.each(['linux', 'windows'] as const)('supports %s window controls without triggering titlebar dragging', (platform) => {
  const drag = vi.fn()
  act(() => root.render(<div onMouseDown={drag}><DesktopWindowControls platform={platform} /></div>))
  const buttons = Array.from(container.querySelectorAll('button'))
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['最小化窗口', '最大化或还原窗口', '关闭窗口'])
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
