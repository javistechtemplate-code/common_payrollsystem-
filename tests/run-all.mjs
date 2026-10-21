// Runs every regression test: build once, identity/secret scan, the browser tests against that
// build, then the golden-master comparison with the baseline. Writes tests/output/summary.json.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO, build, serve, writeJson } from './lib/harness.mjs';

const run = (file, env = {}) => {
  console.log(`\n=== ${file}`);
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(REPO, 'tests', file)], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } });
  const out = String(r.stdout); process.stdout.write(out);
  const m = out.match(/: (\d+)\/(\d+) passed\s*$/m);
  return { file, passed: m ? +m[1] : 0, total: m ? +m[2] : 0, ok: r.status === 0, seconds: Math.round((Date.now() - t) / 1000) };
};

const results = [];
build(REPO);
results.push(run('scan-identity.mjs'));
const srv = await serve(REPO, 4320);
try {
  for (const f of ['security.test.mjs', 'bulk-import.test.mjs', 'units.test.mjs']) results.push(run(f, { TEST_APP_URL: srv.url }));
} finally { srv.stop(); }
results.push(run('golden-master.test.mjs'));

console.log('\n=== Summary');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file.padEnd(24)} ${r.passed}/${r.total} checks  (${r.seconds}s)`);
writeJson(path.join(REPO, 'tests/output/summary.json'), results);
process.exitCode = results.every((r) => r.ok && r.total > 0) ? 0 : 1;
