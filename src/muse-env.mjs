export const NONINTERACTIVE_ENV = {
  DEBIAN_FRONTEND: 'noninteractive',
  DEBIAN_PRIORITY: 'critical',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'true',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  SYSTEMD_PAGER: 'cat',
  LESS: '-FRX',
  PIP_NO_INPUT: '1',
  PIP_EXISTS_ACTION: 'w',
  PIP_DISABLE_PIP_VERSION_CHECK: '1',
  NPM_CONFIG_YES: 'true',
  NPM_CONFIG_FUND: 'false',
  NPM_CONFIG_AUDIT: 'false',
  COMPOSER_NO_INTERACTION: '1',
  PYTHONUNBUFFERED: '1',
  CI: '1',
  NONINTERACTIVE: '1',
};

export function resolveMuseApiKey(env = process.env) {
  return String(
    env.META_API_KEY
    || env.META_MUSE_API_KEY
    || env.MUSE_API_KEY
    || '',
  ).trim();
}

export function hasMuseApiKey(env = process.env) {
  return Boolean(resolveMuseApiKey(env));
}

export function buildMuseSpawnEnv(baseEnv = process.env, extra = {}) {
  const merged = { ...baseEnv, ...NONINTERACTIVE_ENV, ...extra };
  const key = resolveMuseApiKey(merged);
  if (key) merged.META_API_KEY = key;
  return merged;
}

export function museHeadlessSafetyFlags() {
  return ['--yolo', '--user-input-auto-resolve'];
}

export function buildMuseExecArgs({
  prompt,
  model,
  provider = 'meta',
  workspace = null,
  reasoningEffort = null,
} = {}) {
  if (!prompt) throw new Error('buildMuseExecArgs: prompt required');
  if (!model) throw new Error('buildMuseExecArgs: model required');

  const args = [
    'exec',
    ...museHeadlessSafetyFlags(),
    '--json',
    '--provider', provider,
    '--model', model,
  ];
  if (reasoningEffort) args.push('--reasoning-effort', reasoningEffort);
  if (workspace) args.push('--workspace', workspace);
  args.push(prompt);
  return args;
}
