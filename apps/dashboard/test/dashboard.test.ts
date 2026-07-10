import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mergeApps } from '../Domain/Services/app-merge.ts'
import { healthTarget } from '../Domain/Services/health-target.ts'
import { HealthMonitor } from '../Application/Services/Background/health-monitor.ts'
import { DISCOVERY_UA } from '../../Common/access-log/constants.ts'

// A HealthMonitor with a stub probe (isStale only reads the cache; never probes here).
const staleMonitor = () => new HealthMonitor({ probe: async () => 'up' })

const baseConfig = { apps: [], overrides: {} }

test('mergeApps keeps discovered apps and applies overrides', () => {
  const discovered = [{ source: 'docker', containerName: 'sonarr', name: 'sonarr', port: 8989 }]
  const config = { ...baseConfig, overrides: { sonarr: { name: 'Sonarr', group: 'Media' } } }
  const result = mergeApps(discovered, config)
  assert.equal(result.length, 1)
  assert.equal(result[0].name, 'Sonarr')
  assert.equal(result[0].group, 'Media')
})

test('mergeApps hides overridden containers', () => {
  const discovered = [{ source: 'docker', containerName: 'noisy', name: 'noisy', port: 1234 }]
  const config = { ...baseConfig, overrides: { noisy: { hidden: true } } }
  assert.deepEqual(mergeApps(discovered, config), [])
})

test('mergeApps appends manual apps and dedupes by url', () => {
  const discovered = [{ source: 'docker', name: 'ha', url: 'http://ha.local' }]
  const config = {
    ...baseConfig,
    apps: [
      { name: 'Home Assistant', url: 'http://ha.local' },
      { name: 'Router', url: 'http://192.168.1.1' },
    ],
  }
  const result = mergeApps(discovered, config)
  // The duplicate url is dropped, so ha + router = 2 entries.
  assert.equal(result.length, 2)
  assert.ok(result.some((a) => a.name === 'Router'))
})

test('mergeApps orders apps alphabetically by name', () => {
  const discovered = [
    { source: 'docker', name: 'high', port: 9000 },
    { source: 'docker', name: 'low', port: 80 },
    { source: 'docker', name: 'mid', url: 'http://x.local:3000' },
  ]
  const result = mergeApps(discovered, baseConfig)
  assert.deepEqual(
    result.map((a) => a.name),
    ['high', 'low', 'mid']
  )
})

test('healthTarget prefers explicit url, then host+port', () => {
  assert.equal(healthTarget({ url: 'http://x.local' }, 'host.docker.internal'), 'http://x.local')
  assert.equal(healthTarget({ port: 8123 }, 'host.docker.internal'), 'http://host.docker.internal:8123')
  assert.equal(healthTarget({}, 'host.docker.internal'), null)
})

test('isHealthStale: never-probed targets are stale', () => {
  // A fresh cache has no entry for this URL, so it counts as stale.
  assert.equal(staleMonitor().isStale([{ url: 'http://never-probed.local' }], 'host.docker.internal', 30_000), true)
})

test('isHealthStale: apps with no probeable target are not stale', () => {
  assert.equal(staleMonitor().isStale([{}], 'host.docker.internal', 30_000), false)
  assert.equal(staleMonitor().isStale([], 'host.docker.internal', 30_000), false)
})

test('DISCOVERY_UA is the recognizable discovery-agent name', () => {
  assert.equal(DISCOVERY_UA, 'homelab-dashboard-discovery-agent')
})
