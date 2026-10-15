// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SshTerminal } from './SshTerminal'
import { analyzeCudaCommand } from '../utils/cudaCommand'

const mocks = vi.hoisted(() => ({ terminals: [] as any[], fit: vi.fn(), start: vi.fn().mockResolvedValue('session'), close: vi.fn(), resize: vi.fn(), write: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/cudaCommand', () => ({ analyzeCudaCommand: vi.fn().mockReturnValue({ requiresConfirmation: false }) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }))
vi.mock('../services/api', () => ({ api: { isDesktop: true, startTerminal: mocks.start, closeTerminal: mocks.close, resizeTerminal: mocks.resize, writeTerminal: mocks.write } }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = mocks.fit } }))
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  cols = 80; rows = 24
  constructor(public options: any) { mocks.terminals.push(this) }
  loadAddon() {}; open() {}; focus() {}; blur() {}; dispose() {}; write() {}
  input?: (data: string) => void
  onData(callback: (data: string) => void) { this.input = callback; return { dispose() {} } }
} }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  mocks.terminals.length = 0
  vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('does not retain ordinary terminal input when switching to a GPU terminal', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<SshTerminal serverId="test" serverName="test" />))
  await act(async () => {
    for (let i = 0; i < 10000; i++) {
      mocks.terminals[0].input('echo audit')
      mocks.terminals[0].input('\r')
    }
  })
  expect(mocks.write).toHaveBeenCalledTimes(20000)
  expect(analyzeCudaCommand).not.toHaveBeenCalled()
  await act(async () => root!.render(<SshTerminal serverId="test" serverName="test" gpuIndex={0} />))
  await act(async () => { mocks.terminals.at(-1).input('python train.py'); mocks.terminals.at(-1).input('\r') })
  expect(analyzeCudaCommand).toHaveBeenLastCalledWith('python train.py', 0)
})

it.each([0.5, 1, 2])('fits the physical terminal surface at zoom %s without reconnecting', async (initialZoom) => {
  mocks.start.mockResolvedValue('session')
  let zoom = initialZoom
  let resized: (() => void) | undefined
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: () => String(zoom) }) as unknown as CSSStyleDeclaration)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe(target: Element) { expect(target.className).toBe('terminal-surface') }
    disconnect = disconnect
  })
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<SshTerminal serverId="test" serverName="test" />))
  expect(host.querySelector('.terminal-canvas > .terminal-surface')).not.toBeNull()
  expect(mocks.terminals[0].options.fontSize).toBe(12 * initialZoom)
  for (const next of [2, 0.5, 1]) {
    zoom = next
    act(() => { resized!(); frame!(0) })
    expect(mocks.terminals[0].options.fontSize).toBe(12 * next)
    expect(mocks.resize).toHaveBeenLastCalledWith('session', 80, 24)
  }
  expect(mocks.start).toHaveBeenCalledTimes(1)
  expect(mocks.close).not.toHaveBeenCalled()
  act(() => root!.unmount())
  root = undefined
  expect(disconnect).toHaveBeenCalledOnce()
  expect(mocks.close).toHaveBeenCalledWith('session')
})
