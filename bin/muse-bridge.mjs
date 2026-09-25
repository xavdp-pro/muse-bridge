#!/usr/bin/env node
import { loadConfig, ConfigError } from '../src/config.mjs';
import { MuseBridge } from '../src/bridge.mjs';
import { createServer, ensureToken, SERVICE, VERSION } from '../src/server.mjs';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[${SERVICE}] cannot start: ${err.message}`);
    process.exit(78);
  }
  throw err;
}

const token = ensureToken(config.tokenFile);
const bridge = new MuseBridge(config);
const server = createServer({ bridge, token });

server.listen(config.port, config.bind, () => {
  console.log(`[${SERVICE}] ${VERSION} http://${config.bind}:${config.port} model=${config.model || '(stub)'} stub=${config.stubMode}`);
  console.log(`[${SERVICE}] bearer token: ${config.tokenFile}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
