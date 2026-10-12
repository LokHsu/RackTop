// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const helper = readFileSync('src-tauri/assets/ascend-collector.sh', 'utf8')
const live = readFileSync('src-tauri/src/collector.rs', 'utf8')
const history = readFileSync('src-tauri/assets/remote-history-collector.sh', 'utf8')
const directories = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

function probe(environment, npuWorks = false, fallback = 'nvidia', allCandidates = false) {
  const directory = mkdtempSync(join(tmpdir(), 'racktop-probe-test-'))
  directories.push(directory)
  writeFileSync(join(directory, 'set_env.sh'), environment)
  writeFileSync(join(directory, 'npu-smi'), '#!/bin/sh\n' + (npuWorks
    ? 'printf "NPU works\\n"\n'
    : '[ "${RACKTOP_TEST_CANN:-}" = loaded ] && { printf "NPU works\\n"; exit 0; }\nprintf "NPU failed\\n"\nexit 1\n'), { mode: 0o700 })
  if (fallback) writeFileSync(join(directory, `${fallback}-smi`), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const selection = live.split('\n').find(line => line.startsWith('if [ "$racktop_npu_status"'))
  const historySelection = history.split('\n').find(line => line.startsWith('if [ "$racktop_npu_status"'))
  expect(selection).toBeTruthy()
  expect(historySelection).toBeTruthy()
  const env = { ...process.env, PATH: `${directory}:/usr/bin:/bin`, ASCEND_HOME_PATH: directory }
  delete env.LD_LIBRARY_PATH
  delete env.RACKTOP_TEST_CANN
  // Exercise the last candidate without relying on the host's installed CANN.
  const probeHelper = allCandidates
    ? helper.replace(/\/usr\/local\/Ascend\/[^\s]+\/set_env\.sh/g, `${directory}/set_env.sh`)
    : helper
  return spawnSync('sh', ['-s'], {
    input: `${probeHelper}\nset -eu\nracktop_probe_npu\n${selection}\nprintf 'live=%s\\n' "$racktop_accelerator"\nracktop_accelerator=nvidia\n${historySelection}\nprintf 'history=%s\\n' "$racktop_accelerator"\nprintf 'parent=%s\\n' "\${RACKTOP_TEST_CANN:-unset}"\nprintf 'probe=%s\\n' "$racktop_npu_status"\nprintf 'info=%s\\n' "$racktop_npu_info"\n`,
    env, encoding: 'utf8', timeout: 5000,
  })
}

// The production shell helpers run on Linux even when the client is Windows.
test.skipIf(process.platform === 'win32')('failed NPU does not hide NVIDIA in live or history collection', () => {
  const result = probe('exit 1\n')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=nvidia\nhistory=nvidia')
})

test.skipIf(process.platform === 'win32')('CANN can expand unset variables under history nounset without leaking its environment', () => {
  const result = probe('export LD_LIBRARY_PATH="/mock/cann:$LD_LIBRARY_PATH"\nexport RACKTOP_TEST_CANN=loaded\n')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=ascend\nhistory=ascend')
  expect(result.stdout).toContain('parent=unset')
})

test.skipIf(process.platform === 'win32')('vendor exit cannot terminate the parent collector', () => {
  const result = probe('exit 23\n')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=nvidia\nhistory=nvidia')
})

test.skipIf(process.platform === 'win32')('working NPU remains preferred', () => {
  const result = probe('exit 23\n', true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=ascend\nhistory=ascend')
})

test.skipIf(process.platform === 'win32')('failure of the last CANN candidate still allows history sampling', () => {
  const result = probe('exit 23\n', false, 'nvidia', true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=nvidia\nhistory=nvidia')
  expect(result.stdout).toContain('probe=23')
})

test.skipIf(process.platform === 'win32')('failed NPU does not hide PPU in live collection', () => {
  const result = probe('exit 1\n', false, 'ppu')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=ppu')
})

test.skipIf(process.platform === 'win32')('NPU-only failure stays identifiable without terminating collection', () => {
  const result = probe('exit 23\n', false, null, true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('live=ascend\nhistory=ascend')
  expect(result.stdout).toContain('probe=23')
  expect(result.stdout).toContain('info=NPU failed')
})
