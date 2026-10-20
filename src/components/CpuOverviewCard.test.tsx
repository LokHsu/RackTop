// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CpuOverviewCard } from '../App'
import type { Snapshot } from '../types/models'
vi.mock('./SshTerminal', () => ({ SshTerminal: () => null }))
const snapshot = {
  system: { cpuModel: 'CPU', cpuUtilization: 20, currentUserCpuUtilization: 0,
    memoryUsedBytes: 32 * 1024 ** 3, memoryTotalBytes: 64 * 1024 ** 3,
    currentUserMemoryUsedBytes: 8 * 1024 ** 3, load1: 0 },
  processes: [], cpuProcesses: [],
} as unknown as Snapshot

describe('CPU system memory marker', () => {
  it('uses collected user memory even when the filtered process list is empty', () => {
    const html = renderToStaticMarkup(<CpuOverviewCard snapshot={snapshot} memoryPercent={50} onOpen={() => {}} />)
    expect(html).toContain('系统 MEM')
    expect(html).toContain('--own-position:12.5%')
    expect(html).toContain('metric-bar__own-marker')
    expect(html).toContain('你 8.0 GB')
  })
  it('shows the marker at the 2 GiB boundary', () => {
    const html = renderToStaticMarkup(<CpuOverviewCard snapshot={{ ...snapshot, system: { ...snapshot.system, currentUserMemoryUsedBytes: 2 * 1024 ** 3 } }} memoryPercent={50} onOpen={() => {}} />)
    expect(html).toContain('你 2.0 GB')
    expect(html).toContain('metric-bar__own-marker')
  })
  it('does not invent usage for old snapshots or invalid total capacity', () => {
    for (const system of [
      { ...snapshot.system, currentUserMemoryUsedBytes: undefined },
      { ...snapshot.system, currentUserMemoryUsedBytes: 0 },
      { ...snapshot.system, currentUserMemoryUsedBytes: 20 * 1024 ** 2 },
      { ...snapshot.system, currentUserMemoryUsedBytes: 2 * 1024 ** 3 - 1 },
      { ...snapshot.system, memoryTotalBytes: 0 },
    ]) {
      const html = renderToStaticMarkup(<CpuOverviewCard snapshot={{ ...snapshot, system }} memoryPercent={0} onOpen={() => {}} />)
      expect(html).not.toContain('metric-bar__own-marker')
    }
  })
})
