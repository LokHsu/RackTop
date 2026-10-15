// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { api } from '../services/api'

vi.mock('./SshTerminal', () => ({ SshTerminal: () => null }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined

beforeEach(() => {
  vi.spyOn(api, 'listServers').mockResolvedValue([])
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([[2, 1255.2], [3, 1888.8], [4, 2522.4], [5, 3156]])('respects a maximum of %s cards with bounded horizontal adjustment', async (maximum, cappedWidth) => {
  const settings = await api.getSettings()
  vi.spyOn(api, 'getSettings').mockResolvedValue({ ...settings, maxCardsPerRow: Number(maximum) })
  let width = 1100
  let resize: (() => void) | undefined
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      if (target.classList.contains('workspace__scroll')) resize = () => this.callback([], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect = disconnect
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace__scroll') ? width : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace__scroll') ? width : 0
  })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<App />) })
  const style = container.querySelector<HTMLElement>('.app-shell')!.style
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  expect(style.getPropertyValue('--card-page-width')).toBe('1048px')
  expect(resize).toBeDefined()
  for (const [available, expected] of [[1099, 1047], [1100, 1048], [3200, Math.min(3148, cappedWidth)], [400, 348]]) {
    width = Number(available)
    act(() => resize!())
    expect(Number.parseFloat(style.getPropertyValue('--card-page-width'))).toBeCloseTo(Number(expected))
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
  expect(style.getPropertyValue('--card-page-width')).toBe('948px')
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  act(() => root!.unmount())
  root = undefined
  expect(disconnect).toHaveBeenCalled()
})

it.each([0, 13, 17])('preserves the original card width with a %spx scrollbar', async (initialGutter) => {
  let gutter = initialGutter
  let clientWidth = 1100 - gutter
  let resize: (() => void) | undefined
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      if (target.classList.contains('workspace__scroll')) resize = () => this.callback([], this as unknown as ResizeObserver)
    }
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace__scroll') ? clientWidth : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace__scroll') ? clientWidth + gutter : 0
  })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<App />) })
  const shell = container.querySelector<HTMLElement>('.app-shell')!
  const style = shell.style
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  expect(style.getPropertyValue('--card-page-width')).toBe('1048px')
  expect(style.getPropertyValue('--card-page-inset')).toBe(`${52 - gutter}px`)
  expect(style.getPropertyValue('--card-page-offset')).toBe(`${gutter / 2}px`)
  // Content arriving later can add a classic scrollbar without resizing the window.
  const previousGutter = gutter
  gutter = gutter === 0 ? 13 : 0
  clientWidth = 1100 - gutter
  act(() => resize!())
  expect(style.getPropertyValue('--card-page-width')).toBe('1048px')
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  expect(style.getPropertyValue('--card-page-inset')).toBe(`${52 - gutter}px`)
  gutter = previousGutter
  clientWidth = 1100 - gutter
  act(() => resize!())
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true })))
  expect(style.getPropertyValue('--card-page-inset')).toBe('52px')
  expect(style.getPropertyValue('--card-page-offset')).toBe('0px')
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true })))
  expect(style.getPropertyValue('--card-page-width')).toBe('1048px')
  expect(style.getPropertyValue('--card-page-inset')).toBe(`${52 - gutter}px`)
  clientWidth -= 1
  act(() => resize!())
  expect(style.getPropertyValue('--card-page-width')).toBe('1047px')
  expect(style.getPropertyValue('--card-columns')).toBe('2')
  expect(style.getPropertyValue('--card-base-width')).toBe('518px')
  act(() => root!.unmount())
  root = undefined
  expect(style.getPropertyValue('--card-page-inset')).toBe('')
})
