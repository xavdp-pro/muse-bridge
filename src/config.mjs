import os from 'node:os';
import path from 'node:path';

export const MUSE_MODEL_ENV = 'MUSE_MODEL';
export const MUSE_MODEL_ENV_ALT = 'META_MUSE_MODEL';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function resolveMuseModel(env = process.env) {
  return String(env[MUSE_MODEL_ENV] || env[MUSE_MODEL_ENV_ALT] || '').trim();
}

export function loadConfig(env = process.env) {
  const home = env.MUSE_BRIDGE_HOME || path.join(os.homedir(), '.config', 'muse-bridge');
  const stubMode = env.BRIDGE_MUSE_STUB === '1';
  const model = resolveMuseModel(env);

  if (!stubMode && !model) {
    throw new ConfigError(
      `${MUSE_MODEL_ENV} is not set — measure an engine on this host and export `
      + `${MUSE_MODEL_ENV}=<model id> (or ${MUSE_MODEL_ENV_ALT}), or set BRIDGE_MUSE_STUB=1.`,
    );
  }

  return {
    port: Number(env.MUSE_BRIDGE_PORT || 4320),
    bind: env.MUSE_BRIDGE_BIND || '127.0.0.1',
    museBin: env.MUSE_BIN || 'muse',
    model: model || null,
    provider: env.MUSE_PROVIDER || 'meta',
    reasoningEffort: env.MUSE_REASONING_EFFORT || 'high',
    workspaceBase: env.MUSE_WS_BASE || path.join(home, 'workspaces'),
    tokenFile: env.MUSE_BRIDGE_TOKEN_FILE || path.join(home, 'token'),
    stubMode,
  };
}
