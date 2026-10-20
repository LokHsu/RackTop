import { Channel, invoke } from '@tauri-apps/api/core'
import { check, type DownloadEvent, Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type DesktopAppUpdate = Update
export type DesktopDownloadEvent = DownloadEvent

export async function checkDesktopAppUpdate() {
  if (/Linux/i.test(navigator.userAgent)) {
    try {
      const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>('check_linux_app_update')
      return metadata ? new Update(metadata) : null
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`检查更新失败。原始错误：${detail}`)
    }
  }
  const update = await check({ timeout: 30_000 })
  if (update && /Windows/i.test(navigator.userAgent)) {
    update.downloadAndInstall = async onEvent => {
      const channel = new Channel<DownloadEvent>()
      if (onEvent) channel.onmessage = onEvent
      await invoke('install_windows_update', { rid: update.rid, onEvent: channel })
    }
  }
  return update
}

export function relaunchUpdatedApp() {
  return relaunch()
}
