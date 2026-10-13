import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), permission: vi.fn(), request: vi.fn(), send: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-notification', () => ({ isPermissionGranted: mocks.permission, requestPermission: mocks.request, sendNotification: mocks.send, onAction: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  mocks.invoke.mockReset().mockResolvedValue({ idleNotificationsEnabled: true })
  mocks.permission.mockReset().mockResolvedValue(true)
  mocks.request.mockReset().mockResolvedValue('granted')
  mocks.send.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

it.each(['服务器已离线', '预约条件已满足', '显存占用预警', '远端数据需要手动清理'])('globally blocks %s without requesting permission', async (title) => {
  const { api } = await import('./api')
  mocks.invoke.mockResolvedValue({ idleNotificationsEnabled: false })
  await api.notify(title, 'test')
  expect(mocks.permission).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it('sends when enabled and preserves notification payload', async () => {
  const { api } = await import('./api')
  await api.notify('title', 'body', { serverId: 's1' })
  expect(mocks.send).toHaveBeenCalledWith({ title: 'title', body: 'body', extra: { serverId: 's1' }, autoCancel: true })
})

it('rechecks the switch after awaiting permission', async () => {
  const { api } = await import('./api')
  mocks.permission.mockResolvedValue(false)
  mocks.request.mockImplementation(async () => {
    mocks.invoke.mockResolvedValue({ idleNotificationsEnabled: false })
    return 'granted'
  })
  await api.notify('title', 'body')
  expect(mocks.send).not.toHaveBeenCalled()
})

it('does not send when settings cannot be read', async () => {
  const { api } = await import('./api')
  mocks.invoke.mockRejectedValue(new Error('database unavailable'))
  await api.notify('title', 'body')
  expect(mocks.send).not.toHaveBeenCalled()
})

it('does not send when system permission is denied', async () => {
  const { api } = await import('./api')
  mocks.permission.mockResolvedValue(false)
  mocks.request.mockResolvedValue('denied')
  await api.notify('title', 'body')
  expect(mocks.send).not.toHaveBeenCalled()
})
