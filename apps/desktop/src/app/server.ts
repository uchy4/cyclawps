import { ChildProcess, fork, spawn } from 'child_process';
import { app } from 'electron';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import http from 'http';

const TASK_MANAGER_PORT = 3001;
const DASHBOARD_PORT = 4000;
const WHISPER_PORT = 4002;

let serverProcess: ChildProcess | null = null;
let dashboardProcess: ChildProcess | null = null;
let whisperProcess: ChildProcess | null = null;

/**
 * Find the repo root by looking for the task-manager source.
 */
function findRepoRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(__dirname, '..', '..', '..'),
    resolve(__dirname, '..', '..', '..', '..'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'apps', 'task-manager', 'src', 'main.ts'))) {
      return dir;
    }
  }

  return process.cwd();
}

/**
 * Resolves paths depending on whether the app is packaged or in dev mode.
 */
function getPaths() {
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    return {
      dbPath: join(app.getPath('userData'), 'data', 'cyclawps.db'),
      agentsPath: join(resourcesPath, 'agents'),
      staticDir: join(resourcesPath, 'dashboard'),
      serverEntry: join(resourcesPath, 'server', 'main.js'),
      repoRoot: '',
    };
  }

  const repoRoot = findRepoRoot();
  return {
    dbPath: '',
    agentsPath: '',
    staticDir: '',
    serverEntry: join(repoRoot, 'apps', 'task-manager', 'src', 'main.ts'),
    repoRoot,
  };
}

/**
 * Wait for a server to be ready by polling.
 */
function waitForPort(port: number, timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server on port ${port} did not start within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 200);
    };

    check();
  });
}

function pipeOutput(proc: ChildProcess, label: string) {
  proc.stdout?.on('data', (data: Buffer) => {
    console.log(`[${label}] ${data.toString().trim()}`);
  });
  proc.stderr?.on('data', (data: Buffer) => {
    console.error(`[${label}:err] ${data.toString().trim()}`);
  });
  proc.on('error', (err) => {
    console.error(`[${label}] spawn error: ${err.message}`);
  });
}

function killProcess(proc: ChildProcess | null, label: string): void {
  if (!proc) return;
  console.log(`[desktop] Stopping ${label}...`);
  proc.kill('SIGTERM');
  const killTimer = setTimeout(() => {
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
  }, 5000);
  proc.on('exit', () => clearTimeout(killTimer));
}

/**
 * Start all services as child processes.
 */
export async function startServer(): Promise<void> {
  const paths = getPaths();

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    TASK_MANAGER_PORT: String(TASK_MANAGER_PORT),
  };

  if (paths.dbPath) env['DB_PATH'] = paths.dbPath;
  if (paths.agentsPath) env['AGENTS_PATH'] = paths.agentsPath;
  if (paths.staticDir) env['STATIC_DIR'] = paths.staticDir;

  // --- Task Manager ---
  if (app.isPackaged) {
    serverProcess = fork(paths.serverEntry, [], {
      env,
      stdio: 'pipe',
    });
  } else {
    const tsxBin = join(paths.repoRoot, 'node_modules', '.bin', 'tsx');
    serverProcess = spawn(tsxBin, [paths.serverEntry], {
      env,
      stdio: 'pipe',
      cwd: paths.repoRoot,
    });
  }
  pipeOutput(serverProcess, 'task-manager');
  serverProcess.on('exit', (code) => {
    console.log(`[task-manager] exited with code ${code}`);
    serverProcess = null;
  });

  // --- Dashboard (dev only) ---
  if (!app.isPackaged) {
    const viteBin = join(paths.repoRoot, 'node_modules', '.bin', 'vite');
    dashboardProcess = spawn(viteBin, ['--port', String(DASHBOARD_PORT)], {
      env: { ...env, BROWSER: 'none' },
      stdio: 'pipe',
      cwd: join(paths.repoRoot, 'apps', 'dashboard'),
    });
    pipeOutput(dashboardProcess, 'dashboard');
    dashboardProcess.on('exit', (code) => {
      console.log(`[dashboard] exited with code ${code}`);
      dashboardProcess = null;
    });
  }

  // --- Whisper Service (dev only) ---
  if (!app.isPackaged) {
    const whisperDir = join(paths.repoRoot, 'apps', 'whisper-service');
    const venvPython = join(whisperDir, '.venv', 'bin', 'python');
    if (existsSync(venvPython)) {
      whisperProcess = spawn(
        venvPython,
        ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(WHISPER_PORT), '--reload'],
        {
          env,
          stdio: 'pipe',
          cwd: whisperDir,
        }
      );
      pipeOutput(whisperProcess, 'whisper');
      whisperProcess.on('exit', (code) => {
        console.log(`[whisper] exited with code ${code}`);
        whisperProcess = null;
      });
    } else {
      console.log('[desktop] whisper-service venv not found, skipping');
    }
  }

  // Wait for task-manager to be ready before opening the window
  await waitForPort(TASK_MANAGER_PORT);
  console.log('[desktop] task-manager is ready');
}

/**
 * Stop all services.
 */
export function stopServer(): void {
  killProcess(serverProcess, 'task-manager');
  serverProcess = null;
  killProcess(dashboardProcess, 'dashboard');
  dashboardProcess = null;
  killProcess(whisperProcess, 'whisper');
  whisperProcess = null;
}
