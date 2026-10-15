const VERSION_FILES = new Set([
  'package.json', 'package-lock.json', 'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json',
  'src-tauri/tauri.linux.conf.json', 'src-tauri/tauri.windows.conf.json',
]);
const RELEASE_NOTES = new Set(['docs/VERSION_INFOS.md', 'docs/Version_overview.md']);

function productVersion(path, text) {
  if (text === null) return null;
  if (path.endsWith('.json')) {
    const json = JSON.parse(text);
    if (path === 'package-lock.json') {
      return [json.version, json.packages?.['']?.version];
    }
    return json.version ?? null;
  }
  const sections = text.split(/(?=^\[)/m);
  const section = path.endsWith('Cargo.lock')
    ? sections.find(part => /^\[\[package\]\]/.test(part) && /^name\s*=\s*"racktop"\s*$/m.test(part))
    : sections.find(part => /^\[package\]\s*$/m.test(part));
  if (!section) throw new Error(`Missing RackTop package section: ${path}`);
  const version = section.match(/^version\s*=\s*"([^"\r\n]+)"\s*(?:#.*)?$/m)?.[1];
  if (!version) throw new Error(`Missing RackTop package version: ${path}`);
  return version;
}

async function evaluate({ pr, repository, files, readFile }) {
  const sameRepo = pr.head.repo?.full_name === repository;
  if (pr.base.ref === 'main') {
    return sameRepo && pr.head.ref === 'develop'
      ? [] : ['Only this repository\'s develop branch may open a version PR to main. Retarget feature PRs to develop.'];
  }
  if (pr.base.ref !== 'develop') return ['Contribution PRs must target develop.'];
  if (sameRepo && pr.head.ref === 'main') return [];
  if (pr.labels.some(label => label.name === 'release-preparation')) return [];

  const errors = [];
  for (const file of files) {
    const paths = [file.filename, file.previous_filename].filter(Boolean);
    if (paths.some(path => RELEASE_NOTES.has(path))) {
      errors.push(`${file.filename}: formal release notes are maintained during release preparation.`);
    }
    for (const path of new Set(paths.filter(path => VERSION_FILES.has(path)))) {
      const before = productVersion(path, await readFile(path, pr.base.sha));
      const after = productVersion(path, await readFile(path, pr.head.sha));
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        errors.push(`${path}: application version changes require a maintainer's release-preparation label.`);
      }
    }
  }
  return errors;
}

async function check({ github, context, core }) {
  // Read current metadata so label/base changes do not reuse an old decision.
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: context.issue.number });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...context.repo, pull_number: pr.number, per_page: 100,
  });
  const readFile = async (path, ref) => {
    try {
      const { data } = await github.rest.repos.getContent({ ...context.repo, path, ref });
      if (data.type !== 'file' || data.encoding !== 'base64') throw new Error(`Cannot read ${path}`);
      return Buffer.from(data.content, 'base64').toString('utf8');
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const errors = await evaluate({ pr, repository: `${context.repo.owner}/${context.repo.repo}`, files, readFile });
  if (errors.length) core.setFailed(errors.join('\n'));
  else core.info('Contribution branch and version policy passed. Human approval and platform CI are still required.');
}

module.exports = check;
module.exports.evaluate = evaluate;
module.exports.productVersion = productVersion;
