import { afterEach, describe, expect, it, vi } from 'vitest'
const { check, invoke } = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: class { onmessage?: (event: unknown) => void } }))
import { checkDesktopAppUpdate } from './appUpdater'

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })
describe('desktop updater handoff', () => {
  it('uses the Windows native handoff and forwards progress with the checked resource', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
    const originalInstall = vi.fn()
    check.mockResolvedValue({ rid: 17, downloadAndInstall: originalInstall })
    const update = await checkDesktopAppUpdate()
    const progress = vi.fn()
    invoke.mockImplementation(async (_, args) => {
      args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 123 } })
    })
    await update!.downloadAndInstall(progress)
    expect(check).toHaveBeenCalledWith({ timeout: 30_000 })
    expect(invoke).toHaveBeenCalledWith('install_windows_update', { rid: 17, onEvent: expect.anything() })
    expect(progress).toHaveBeenCalledWith({ event: 'Progress', data: { chunkLength: 123 } })
    expect(originalInstall).not.toHaveBeenCalled()
  })
  it('propagates native errors to the existing updater error UI', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
    check.mockResolvedValue({ rid: 17 })
    invoke.mockRejectedValue(new Error('signature verification failed'))
    const update = await checkDesktopAppUpdate()
    await expect(update!.downloadAndInstall()).rejects.toThrow('signature verification failed')
  })
  it.each(['Macintosh', 'Linux'])('preserves the official %s installer', async userAgent => {
    vi.stubGlobal('navigator', { userAgent })
    const originalInstall = vi.fn()
    check.mockResolvedValue({ rid: 17, downloadAndInstall: originalInstall })
    const update = await checkDesktopAppUpdate()
    await update!.downloadAndInstall()
    expect(originalInstall).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
  it('preserves no-update and check-failure results', async () => {
    check.mockResolvedValue(null)
    expect(await checkDesktopAppUpdate()).toBeNull()
    check.mockRejectedValue(new Error('offline'))
    await expect(checkDesktopAppUpdate()).rejects.toThrow('offline')
    expect(invoke).not.toHaveBeenCalled()
  })
})
