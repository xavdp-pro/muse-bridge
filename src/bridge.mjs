import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMuseExecArgs,
  buildMuseSpawnEnv,
  hasMuseApiKey,
} from './muse-env.mjs';
import { vitals, cliCheck, writable } from './vitals.mjs';

export class ModelUnsetError extends Error {
  constructor(envVar = 'MUSE_MODEL') {
    super(`muse-bridge: no model is set. Export ${envVar}=<measured model id> or BRIDGE_MUSE_STUB=1.`);
    this.name = 'ModelUnsetError';
    this.code = 'BRIDGE_MODEL_UNSET';
  }
}

export function normalizeConversationName(name) {
  if (!name || typeof name !== 'string') return 'default';
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean || 'default';
}

export function formatSseEvent(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export class MuseBridge {
  constructor(config) {
    this.config = config;
    this.port = config.port;
    this.museBin = config.museBin;
    this.stubMode = config.stubMode;
    this.defaultModel = config.model;
    this.defaultProvider = config.provider;
    this.defaultReasoningEffort = config.reasoningEffort;
    this.workspaceBase = config.workspaceBase;
    this.clients = new Map();
    this.runningProcesses = new Map();
    this.metrics = { injects: 0, completions: 0, errors: 0 };
    this.startedAt = new Date().toISOString();
    fs.mkdirSync(this.workspaceBase, { recursive: true });
  }

  async getVitals(now = Date.now()) {
    const wsCheck = await writable(fs, this.workspaceBase);
    const cliInfo = cliCheck(execFileSync, this.museBin, ['--version']);
    return vitals({
      service: 'muse-bridge',
      startedAt: this.startedAt,
      signals: {
        injects: this.metrics.injects,
        completions: this.metrics.completions,
        errors: this.metrics.errors,
        runsInFlight: this.runningProcesses.size,
        model: this.defaultModel,
        provider: this.defaultProvider,
        reasoningEffort: this.defaultReasoningEffort,
        hasApiKey: hasMuseApiKey(process.env),
        stubMode: this.stubMode,
        cli: cliInfo,
      },
      checks: { workspace: wsCheck },
    }, now);
  }

  ensureWorkspace(conversationName) {
    const conv = normalizeConversationName(conversationName);
    const wsPath = path.join(this.workspaceBase, conv);
    fs.mkdirSync(wsPath, { recursive: true });
    return wsPath;
  }

  broadcast(obj, filterConv = null) {
    const line = formatSseEvent(obj);
    for (const [res, clientFilter] of this.clients.entries()) {
      if (filterConv && clientFilter && clientFilter !== filterConv) continue;
      try { res.write(line); } catch { /* closed */ }
    }
  }

  buildContextualPrompt(userPrompt, { contextFile = null, contextText = null, perimeter = null } = {}) {
    let finalPrompt = '';
    if (contextFile && fs.existsSync(contextFile)) {
      finalPrompt += `[BUSINESS CONTEXT (${path.basename(contextFile)})]\n${fs.readFileSync(contextFile, 'utf8')}\n\n`;
    }
    if (contextText) finalPrompt += `[INSTRUCTIONS]\n${contextText}\n\n`;
    if (perimeter && fs.existsSync(perimeter)) {
      finalPrompt += `[PERIMETER]\nModify files only under ${perimeter}.\n\n`;
    }
    finalPrompt += `[USER REQUEST]\n${userPrompt}`;
    return finalPrompt;
  }

  runAgentStub(conv, runId) {
    setTimeout(() => {
      this.broadcast({
        type: 'text_delta',
        conversation: conv,
        run_id: runId,
        text: `[Muse stub ${this.defaultModel || 'none'}] headless OK`,
      }, conv);
      this.broadcast({ type: 'done', conversation: conv, run_id: runId, exit_code: 0, stub: true }, conv);
      this.metrics.completions++;
    }, 10);
    return {
      runId,
      cwd: this.ensureWorkspace(conv),
      model: this.defaultModel,
      provider: this.defaultProvider,
      stub: true,
    };
  }

  runAgent(conversationName, prompt, opts = {}) {
    const conv = normalizeConversationName(conversationName);
    const cwd = this.ensureWorkspace(conv);
    const runId = `run-muse-${Date.now()}`;
    const model = opts.model || this.defaultModel;
    if (!this.stubMode && !model) throw new ModelUnsetError();

    const fullPrompt = this.buildContextualPrompt(prompt, {
      contextFile: opts.contextFile || null,
      contextText: opts.contextText || null,
      perimeter: opts.perimeter || null,
    });

    const provider = opts.provider || this.defaultProvider;
    const reasoningEffort = opts.reasoningEffort || opts.reasoning_effort || this.defaultReasoningEffort;

    this.broadcast({
      type: 'start',
      conversation: conv,
      run_id: runId,
      model,
      provider,
      reasoningEffort,
    }, conv);

    if (this.stubMode) return this.runAgentStub(conv, runId);

    let workDir = cwd;
    if (opts.perimeter) {
      if (fs.existsSync(opts.perimeter)) {
        workDir = opts.perimeter;
      } else {
        this.broadcast({
          type: 'log', conversation: conv, run_id: runId,
          text: `perimeter ${opts.perimeter} is not reachable from this bridge`,
        }, conv);
        this.metrics.errors++;
        this.broadcast({ type: 'done', conversation: conv, run_id: runId, exit_code: 126 }, conv);
        return { runId, cwd, model, provider, refused: 'perimeter_unreachable' };
      }
    }

    const args = buildMuseExecArgs({
      prompt: fullPrompt,
      model,
      provider,
      workspace: workDir,
      reasoningEffort,
    });

    const proc = spawn(this.museBin, args, {
      cwd: workDir,
      env: buildMuseSpawnEnv(process.env, opts.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.runningProcesses.set(conv, proc);

    let concluded = false;

    proc.on('error', (err) => {
      concluded = true;
      this.runningProcesses.delete(conv);
      this.metrics.errors++;
      this.broadcast({
        type: 'log', conversation: conv, run_id: runId,
        text: `cannot start ${this.museBin}: ${err.code || err.message}`,
      }, conv);
      this.broadcast({ type: 'done', conversation: conv, run_id: runId, exit_code: 127 }, conv);
    });

    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.broadcast({ type: 'agent_event', conversation: conv, run_id: runId, raw: JSON.parse(line) }, conv);
        } catch {
          this.broadcast({ type: 'text_delta', conversation: conv, run_id: runId, text: line }, conv);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      this.broadcast({ type: 'log', conversation: conv, run_id: runId, text: chunk.toString('utf8') }, conv);
    });

    proc.on('close', (code) => {
      if (concluded) return;
      concluded = true;
      this.runningProcesses.delete(conv);
      if (code === 0) this.metrics.completions++;
      else this.metrics.errors++;
      this.broadcast({ type: 'done', conversation: conv, run_id: runId, exit_code: code }, conv);
    });

    return { runId, cwd: workDir, model, provider, reasoningEffort };
  }
}
