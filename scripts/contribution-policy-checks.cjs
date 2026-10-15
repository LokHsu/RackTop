const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, productVersion } = require('./contribution-policy.cjs');

const repository = 'Tongzh-SEU/RackTop';
const pr = {
  base: { ref: 'develop', sha: 'base' },
  head: { ref: 'feature/example', sha: 'head', repo: { full_name: repository } },
  labels: [],
};
const run = (overrides = {}) => evaluate({
  pr, repository, files: [], readFile: async () => null, ...overrides,
});

test('features target develop; only the local develop can target main', async () => {
  assert.deepEqual(await run(), []);
  const toMain = { ...pr, base: { ...pr.base, ref: 'main' } };
  assert.equal((await run({ pr: toMain })).length, 1);
  assert.deepEqual(await run({ pr: { ...toMain, head: { ...pr.head, ref: 'develop' } } }), []);
  assert.equal((await run({ pr: { ...toMain, head: { ...pr.head, ref: 'develop', repo: { full_name: 'other/RackTop' } } } })).length, 1);
  assert.equal((await run({ pr: { ...pr, base: { ...pr.base, ref: 'updater' } } })).length, 1);
});

test('dependency changes pass; application version changes fail', async () => {
  const files = [{ filename: 'package-lock.json' }];
  const json = (version, dependency) => JSON.stringify({ version, packages: { '': { version }, 'node_modules/x': { version: dependency } } });
  assert.deepEqual(await run({ files, readFile: async (_, ref) => json('1.26.0', ref) }), []);
  assert.equal((await run({ files, readFile: async (_, ref) => json(ref === 'base' ? '1.26.0' : '1.27.0', '1') })).length, 1);
});

test('release notes and renamed version files cannot bypass the check', async () => {
  assert.equal((await run({ files: [{ filename: 'notes.md', previous_filename: 'docs/VERSION_INFOS.md' }] })).length, 1);
  assert.equal((await run({ files: [{ filename: 'old.json', previous_filename: 'package.json' }], readFile: async (_, ref) => ref === 'base' ? '{"version":"1.26.0"}' : null })).length, 1);
});

test('maintainer preparation and main synchronization may carry versions', async () => {
  const files = [{ filename: 'docs/VERSION_INFOS.md' }];
  assert.deepEqual(await run({ files, pr: { ...pr, labels: [{ name: 'release-preparation' }] } }), []);
  assert.deepEqual(await run({ files, pr: { ...pr, head: { ...pr.head, ref: 'main' } } }), []);
});

test('Cargo extraction distinguishes application and dependency versions', () => {
  const lock = 'version = 4\n[[package]]\nname = "dep"\nversion = "3.0.0"\n[[package]]\nname = "racktop"\nversion = "1.26.0"\n';
  assert.equal(productVersion('src-tauri/Cargo.lock', lock), '1.26.0');
  assert.equal(productVersion('src-tauri/Cargo.toml', '[package]\nname = "racktop"\nversion = "1.26.0"\n[dependencies]\nx = "2"\n'), '1.26.0');
  assert.throws(() => productVersion('src-tauri/Cargo.toml', '[package]\nversion.workspace = true\n'));
  assert.throws(() => productVersion('package.json', '{broken'));
});
