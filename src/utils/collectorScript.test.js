// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const helper = readFileSync('src-tauri/assets/ascend-collector.sh', 'utf8')
const live = readFileSync('src-tauri/src/collector.rs', 'utf8')
const history = readFileSync('src-tauri/assets/remote-history-collector.sh', 'utf8')
const directories = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

test.skipIf(process.platform === 'win32')('directory usage pairs du with subsequent df, deduplicates paths and rejects partial failures', () => {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true })
  const directory = mkdtempSync(join(process.cwd(), 'tmp/racktop-du-test-'))
  directories.push(directory)
  const home = join(directory, 'home')
  mkdirSync(home)
  mkdirSync(join(directory, 'tester'))
  writeFileSync(join(directory, 'df'), '#!/bin/sh\nif [ "$1" = --output=target ]; then printf "%s\\n" "$TEST_MOUNT"; else echo df >> "$TEST_LOG"; printf "Filesystem 1024-blocks Used Available Capacity Mounted on\\nmock 100 40 60 40%% /data\\n"; fi\n', { mode: 0o700 })
  writeFileSync(join(directory, 'id'), '#!/bin/sh\necho tester\n', { mode: 0o700 })
  writeFileSync(join(directory, 'readlink'), '#!/bin/sh\nprintf "%s\\n" "$3"\n', { mode: 0o700 })
  writeFileSync(join(directory, 'stat'), '#!/bin/sh\necho 1:1\n', { mode: 0o700 })
  writeFileSync(join(directory, 'timeout'), '#!/bin/sh\n[ "$3" = 600 ] || exit 2\nshift 3\nexec "$@"\n', { mode: 0o700 })
  const script = join(directory, 'scan.sh')
  writeFileSync(script, readFileSync('src-tauri/assets/disk-usage.sh', 'utf8'))
  const log = join(directory, 'log')
  const run = (du, environment = {}) => {
    writeFileSync(log, '')
    writeFileSync(join(directory, 'du'), `#!/bin/sh\necho du >> "$TEST_LOG"\n[ "$#" = 3 ] || exit 2\n${du}\n`, { mode: 0o700 })
    return spawnSync('sh', [script, directory], { env: { ...process.env, HOME: home, TEST_MOUNT: directory, TEST_LOG: log, PATH: `${directory}:/usr/bin:/bin`, ...environment }, encoding: 'utf8', timeout: 10000 })
  }
  expect(run('printf "42 /fake\\n"').stdout).toMatch(/^0\|scanning\n0\|success\|40\|100\|60\|42\|\d+\n$/)
  expect(readFileSync(log, 'utf8')).toBe('du\ndf\n')
  expect(run('printf "0 /fake\\n"').stdout).toContain('|60|0|')
  expect(run('printf "42 /fake\\n"; echo "Permission denied" >&2; exit 1').stdout).toBe('0|scanning\n0|permissionDenied\n')
  expect(readFileSync(log, 'utf8')).toBe('du\n')
  expect(run('exit 1').stdout).toBe('0|scanning\n0|failed\n')
  expect(run('echo invalid').stdout).toBe('0|scanning\n0|failed\n')
  expect(run('exit 1', { TEST_MOUNT: '/different' }).stdout).toBe('0|scanning\n0|unrecognized\n')
  const nestedHome = join(directory, 'tester/sub')
  mkdirSync(nestedHome)
  writeFileSync(join(directory, 'stat'), '#!/bin/sh\nprintf "%s\\n" "$4"\n', { mode: 0o700 })
  expect(run('printf "42 /fake\\n"', { HOME: nestedHome }).stdout).toContain('|60|42|')
  writeFileSync(join(directory, 'timeout'), '#!/bin/sh\nexit 124\n', { mode: 0o700 })
  expect(run('echo 42').stdout).toBe('0|scanning\n0|timeout\n')
}, 60_000)

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
