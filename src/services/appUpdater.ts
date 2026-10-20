import { Channel, invoke } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type DesktopAppUpdate = Update
export type DesktopDownloadEvent = DownloadEvent

export async function checkDesktopAppUpdate() {
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
