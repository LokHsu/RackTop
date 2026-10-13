// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('./SshTerminal', () => ({ SshTerminal: () => null }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('fits the entire card page to one, two or three columns without changing the initial card width', async () => {
  let width = 1100
  let resize: (() => void) | undefined
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      if (target.classList.contains('workspace')) resize = () => this.callback([], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect = disconnect
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace') ? width : 0
  })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<App />) })
  const style = container.querySelector<HTMLElement>('.app-shell')!.style
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  expect(style.getPropertyValue('--card-page-width')).toBe('1048px')
  expect(resize).toBeDefined()
  for (const [available, expected] of [[1099, '518px'], [1100, '1048px'], [1630, '1578px'], [2400, '1578px'], [400, '518px']]) {
    width = Number(available)
    act(() => resize!())
    expect(style.getPropertyValue('--card-page-width')).toBe(expected)
    expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  }
  const shell = container.querySelector<HTMLElement>('.app-shell')!
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true })))
  expect(shell.dataset.zoomLayout).toBe('enlarged')
  expect(style.getPropertyValue('--card-page-width')).toBe('1180px')
  width = 1000
  act(() => resize!())
  expect(style.getPropertyValue('--card-page-width')).toBe('1180px')
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true })))
  expect(shell.dataset.zoomLayout).toBe('fixed')
  expect(style.getPropertyValue('--card-page-width')).toBe('518px')
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  act(() => root!.unmount())
  root = undefined
  expect(disconnect).toHaveBeenCalled()
})
