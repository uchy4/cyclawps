import { ChildProcess, fork, spawn } from 'child_process';
import { app } from 'electron';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import http from 'http';

const TASK_MANAGER_PORT = 3001;

let serverProcess: ChildProcess | null = null;

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
 * Wait for the server to be ready by polling.
 */
function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}/api/tasks`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 200);
    };

    check();
  });
}

/**
 * Start the task-manager server as a child process.
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

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[task-manager] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[task-manager:err] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error(`[task-manager] spawn error: ${err.message}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[task-manager] exited with code ${code}`);
    serverProcess = null;
  });

  await waitForServer(TASK_MANAGER_PORT);
  console.log('[desktop] task-manager is ready');
}

/**
 * Stop the task-manager server.
 */
export function stopServer(): void {
  if (!serverProcess) return;

  console.log('[desktop] Stopping task-manager...');
  serverProcess.kill('SIGTERM');

  const killTimer = setTimeout(() => {
    if (serverProcess) {
      serverProcess.kill('SIGKILL');
      serverProcess = null;
    }
  }, 5000);

  serverProcess.on('exit', () => {
    clearTimeout(killTimer);
    serverProcess = null;
  });
}
