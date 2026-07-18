import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const checks = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
}

const pluginRoot = 'plugins/eazinvoice-invoicing-for-msmes';
const pluginFile = `${pluginRoot}/eazinvoice-invoicing-for-msmes.php`;
const pluginReadme = `${pluginRoot}/readme.txt`;
const pluginZip = `${pluginRoot}-1.0.5.zip`;

const pluginPhp = read(pluginFile);
const readme = read(pluginReadme);

const versionMatch = pluginPhp.match(/\*\s+Version:\s+([^\n]+)/);
const constantMatch = pluginPhp.match(/EAZINVOICE_VERSION',\s*'([^']+)'/);
const stableMatch = readme.match(/Stable tag:\s*([^\n]+)/);

const pluginVersion = versionMatch?.[1]?.trim();
const constantVersion = constantMatch?.[1]?.trim();
const stableTag = stableMatch?.[1]?.trim();

check('Plugin header version exists', Boolean(pluginVersion), pluginVersion || 'missing');
check('Plugin constant version matches header', pluginVersion === constantVersion, `${pluginVersion || 'missing'} / ${constantVersion || 'missing'}`);
check('Readme stable tag matches plugin version', pluginVersion === stableTag, `${pluginVersion || 'missing'} / ${stableTag || 'missing'}`);
check('GPL license declared', /License:\s*GPLv2 or later/i.test(pluginPhp) && /License:\s*GPLv2 or later/i.test(readme));
check('WordPress SOP exists', exists('docs/wordpress-plugin-sop.md'));
check('Web user manual exists', exists('docs/user-manual-web.md'));
check('Android user manual exists', exists('docs/user-manual-android.md'));
check('Release SOP exists', exists('docs/release-and-verification-sop.md'));
check('AI Agent roadmap exists', exists('docs/ai-agent-roadmap.md'));
check('Android debug APK exists', exists('android/app/build/outputs/apk/debug/app-debug.apk'));
check('Plugin 1.0.5 zip exists', exists(pluginZip), pluginZip);

for (const item of checks) {
  const marker = item.passed ? 'PASS' : 'FAIL';
  console.log(`${marker} ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}

const failed = checks.filter((item) => !item.passed);

if (failed.length > 0) {
  console.error(`Release readiness failed: ${failed.length} check(s) need attention.`);
  process.exitCode = 1;
}
