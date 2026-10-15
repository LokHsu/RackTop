// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it.skipIf(process.platform === 'win32').each([0, 2, 5])('handles %s busy unmount attempts without forcing or hiding failure', (failures) => {
  const result = spawnSync('bash', ['-c', `
    source "$1"
    attempts=0
    sleeps=0
    sleep() { sleeps=$((sleeps + 1)); }
    mount() { printf '/dev/disk4 on /Volumes/test dmg (hfs, local)\\n'; }
    failures="$2"
    hdiutil() {
      [ "$#" -eq 2 ] && [ "$1" = detach ] && [ "$2" = '/Volumes/test dmg' ] || exit 99
      attempts=$((attempts + 1))
      [ "$attempts" -gt "$failures" ]
    }
    detach_dmg '/Volumes/test dmg'
    status=$?
    printf '%s %s %s' "$status" "$attempts" "$sleeps"
    exit "$status"
  `, '_', resolve('scripts/macos-dmg.sh'), String(failures)], { encoding: 'utf8' })
  expect(result.status).toBe(failures === 5 ? 1 : 0)
  expect(result.stdout).toBe(failures === 5 ? '1 5 4' : `0 ${failures + 1} ${failures}`)
  if (failures === 5) expect(result.stderr).toContain('Could not detach DMG after 5 attempts')
})


it.skipIf(process.platform === 'win32')('checks disappeared mounts and unreadable mount state', () => {
  const result = spawnSync('bash', [resolve('scripts/macos-dmg.test.sh')], { encoding: 'utf8' })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('PASS: gone')
  expect(result.stdout).toContain('PASS: unknown')
})
