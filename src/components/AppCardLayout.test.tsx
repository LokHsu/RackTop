// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'
import { api } from '../services/api'

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

function stubCardScrollContainer(initialClientWidth: number) {
  const state = { clientWidth: initialClientWidth, resize: undefined as (() => void) | undefined }
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      if (target.classList.contains('workspace__scroll')) state.resize = () => this.callback([], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  // The card page is sized from this container's client box, which in the packaged
  // build is already the post-scrollbar width; callers pass that narrower value.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workspace__scroll') ? state.clientWidth : 0
  })
  return state
}

async function renderApp() {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<App />) })
  const style = container.querySelector<HTMLElement>('.app-shell')!.style
  return {
    style,
    read: () => ({
      base: Number.parseFloat(style.getPropertyValue('--card-base-width')) || 0,
      page: Number.parseFloat(style.getPropertyValue('--card-page-width')) || 0,
    }),
  }
}

it.each([[2, 1180], [3, 1776], [4, 2372], [5, 2968]])('caps the row at %s cards without changing the frozen card width', async (maximum, cappedPageWidth) => {
  const settings = await api.getSettings()
  vi.spyOn(api, 'getSettings').mockResolvedValue({ ...settings, maxCardsPerRow: maximum })
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  // A 3200px container freezes the card at the 1180px reading width and leaves room for
  // five of them, so each setting below is limited by the maximum, not the width.
  stubCardScrollContainer(3200)
  const { style } = await renderApp()
  expect(style.getPropertyValue('--card-base-width')).toBe('584px')
  expect(style.getPropertyValue('--card-page-width')).toBe(`${cappedPageWidth}px`)
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true })))
  expect(style.getPropertyValue('--card-page-width')).toBe('1180px')
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true })))
  expect(style.getPropertyValue('--card-page-width')).toBe(`${cappedPageWidth}px`)
  act(() => root!.unmount())
  root = undefined
})

it('keeps two cards on the default window even though the scrollbar narrows the card page', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  // 1320px window: workspace 1100px, scroller client box 1087px after its scrollbar,
  // which freezes two cards of (1087 - 52 - 12) / 2 = 511.5px.
  stubCardScrollContainer(1087)
  const { read } = await renderApp()
  // This is the shipped 1.25.6 failure: freezing the width from the 1100px workspace
  // asked for more than the 1035px page could give, so the row fell back to one column.
  expect(read()).toEqual({ base: 511.5, page: 1035 })
  act(() => root!.unmount())
  root = undefined
})

it.each([[1200, 1035], [1620, 1558.5]])('adds a column as the container widens to %spx without resizing the cards', async (clientWidth, expectedPage) => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1320)
  // Resizing only changes how many of the frozen 511.5px cards share the row: two up to
  // 1559px of page, three from 1578px on.
  const state = stubCardScrollContainer(1087)
  const { read } = await renderApp()
  expect(state.resize).toBeDefined()
  expect(read()).toEqual({ base: 511.5, page: 1035 })
  state.clientWidth = clientWidth
  act(() => state.resize!())
  expect(read()).toEqual({ base: 511.5, page: expectedPage })
  act(() => root!.unmount())
  root = undefined
})

it('drops to one frozen card when the container can no longer hold two', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(900)
  // 900px is the configured minimum window width: a 667px container freezes two 301.5px
  // cards, and narrowing it below 615px of page keeps a single one of those cards.
  const state = stubCardScrollContainer(667)
  const { read } = await renderApp()
  expect(read()).toEqual({ base: 301.5, page: 615 })
  state.clientWidth = 560
  act(() => state.resize!())
  expect(read()).toEqual({ base: 301.5, page: 301.5 })
  act(() => root!.unmount())
  root = undefined
})
