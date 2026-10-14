import type { AppPlatform } from './platform'

interface WindowState {
  isMaximized(): Promise<boolean>
  isFullscreen(): Promise<boolean>
  onResized(handler: () => void): Promise<() => void>
}

export async function syncLinuxWindowShape(platform: AppPlatform, window: WindowState, element: HTMLElement) {
  if (platform !== 'linux') return
  let revision = 0
  const update = async () => {
    const current = ++revision
    const [maximized, fullscreen] = await Promise.all([window.isMaximized(), window.isFullscreen()])
    if (current === revision) element.dataset.windowSquare = String(maximized || fullscreen)
  }
  const unlisten = await window.onResized(() => { void update().catch(console.error) })
  await update().catch(console.error)
  return unlisten
}
