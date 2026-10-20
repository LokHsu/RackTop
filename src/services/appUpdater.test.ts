import { afterEach, describe, expect, it, vi } from 'vitest'
const { check, invoke } = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/plugin-updater')>(), check,
}))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('@tauri-apps/api/core', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/api/core')>(),
  invoke, Channel: class { onmessage?: (event: unknown) => void },
}))
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
  it('preserves the official macOS installer', async () => {
    const userAgent = 'Macintosh'
    vi.stubGlobal('navigator', { userAgent })
    const originalInstall = vi.fn()
    check.mockResolvedValue({ rid: 17, downloadAndInstall: originalInstall })
    const update = await checkDesktopAppUpdate()
    await update!.downloadAndInstall()
    expect(check).toHaveBeenCalledWith({ timeout: 30_000 })
    expect(originalInstall).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
  it('uses native Linux networking and the official installer resource', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { transformCallback: vi.fn(), invoke } })
    invoke.mockResolvedValueOnce({ rid: 17, currentVersion: '1.25.0', version: '1.25.5', rawJson: {} })
    const update = await checkDesktopAppUpdate()
    await update!.downloadAndInstall(undefined, { timeout: 900_000 })
    expect(invoke).toHaveBeenCalledWith('check_linux_app_update')
    expect(check).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('plugin:updater|download_and_install', expect.objectContaining({ rid: 17, timeout: 900_000 }), undefined)
    expect(update!.version).toBe('1.25.5')
  })
  it('propagates signature rejection from the official Linux downloader', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
    vi.stubGlobal('window', { __TAURI_INTERNALS__: { transformCallback: vi.fn(), invoke } })
    invoke.mockResolvedValueOnce({ rid: 17, currentVersion: '1.25.0', version: '1.25.5', rawJson: {} })
    const update = await checkDesktopAppUpdate()
    invoke.mockRejectedValueOnce(new Error('signature verification failed'))
    await expect(update!.downloadAndInstall()).rejects.toThrow('signature verification failed')
  })
  it.each(['Macintosh', 'Windows NT 10.0'])('preserves %s no-update and original errors', async userAgent => {
    vi.stubGlobal('navigator', { userAgent })
    check.mockResolvedValueOnce(null)
    expect(await checkDesktopAppUpdate()).toBeNull()
    const originalError = new Error('offline')
    check.mockRejectedValueOnce(originalError)
    await expect(checkDesktopAppUpdate()).rejects.toBe(originalError)
    expect(check).toHaveBeenCalledWith({ timeout: 30_000 })
    expect(invoke).not.toHaveBeenCalled()
  })
  it('does not fall back to AppImage when the DEB feed is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
    invoke.mockRejectedValue(new Error('the platform linux-x86_64-deb was not found'))
    await expect(checkDesktopAppUpdate()).rejects.toThrow('linux-x86_64-deb')
    expect(check).not.toHaveBeenCalled()
  })
  it('rejects an unpackaged Linux binary before contacting the updater', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
    invoke.mockRejectedValue(new Error('unsupported development binary'))
    await expect(checkDesktopAppUpdate()).rejects.toThrow('unsupported development binary')
    expect(check).not.toHaveBeenCalled()
  })
  it('preserves Linux no-update and the underlying network cause', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
    invoke.mockResolvedValueOnce(null)
    expect(await checkDesktopAppUpdate()).toBeNull()
    invoke.mockRejectedValueOnce('error sending request; TLS handshake timed out')
    await expect(checkDesktopAppUpdate()).rejects.toThrow('TLS handshake timed out')
  })
})
