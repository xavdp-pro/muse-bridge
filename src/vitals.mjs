export function ageSeconds(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.round((now - t) / 100) / 10 : null;
}

export function vitals({ service, startedAt, signals = {}, checks = {} }, now = Date.now()) {
  return {
    service,
    at: new Date(now).toISOString(),
    uptimeSeconds: ageSeconds(startedAt, now),
    signals,
    checks,
  };
}

export async function writable(fsModule, dirPath) {
  if (!dirPath) return { path: null, writable: false, reason: 'no path configured' };
  const probe = `${dirPath.replace(/\/$/, '')}/.vitals-probe`;
  try {
    await fsModule.promises.writeFile(probe, '');
    await fsModule.promises.unlink(probe);
    return { path: dirPath, writable: true };
  } catch (err) {
    return { path: dirPath, writable: false, reason: err.message };
  }
}

export function cliCheck(execFileSync, bin, args = ['--version']) {
  try {
    const out = execFileSync(bin, args, { encoding: 'utf8', timeout: 5000 }).trim();
    return { bin, reachable: true, version: out.split('\n')[0] || out };
  } catch (err) {
    return { bin, reachable: false, error: err.code || err.message };
  }
}
