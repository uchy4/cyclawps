import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface Service {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  color: string;
}

const services: Service[] = [
  {
    name: 'server',
    command: 'npx',
    args: ['tsx', 'watch', 'src/main.ts'],
    cwd: path.join(ROOT, 'apps/task-manager'),
    color: '\x1b[36m', // cyan
  },
  {
    name: 'kanban',
    command: 'npx',
    args: ['vite', '--port', '4200'],
    cwd: path.join(ROOT, 'apps/kanban-board'),
    color: '\x1b[32m', // green
  },
  {
    name: 'chat',
    command: 'npx',
    args: ['vite', '--port', '4201'],
    cwd: path.join(ROOT, 'apps/chat-client'),
    color: '\x1b[33m', // yellow
  },
  {
    name: 'config',
    command: 'npx',
    args: ['vite', '--port', '4202'],
    cwd: path.join(ROOT, 'apps/agent-configurator'),
    color: '\x1b[35m', // magenta
  },
  {
    name: 'dashboard',
    command: 'npx',
    args: ['vite', '--port', '4000'],
    cwd: path.join(ROOT, 'apps/dashboard'),
    color: '\x1b[34m', // blue
  },
];

const RESET = '\x1b[0m';
const children: ChildProcess[] = [];

function prefixStream(name: string, color: string, stream: NodeJS.ReadableStream) {
  stream.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
      }
    }
  });
}

console.log('\x1b[1m--- Cyclawps: Starting all services ---\x1b[0m\n');

for (const service of services) {
  console.log(`${service.color}[${service.name}]${RESET} Starting in ${service.cwd}`);

  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (child.stdout) prefixStream(service.name, service.color, child.stdout);
  if (child.stderr) prefixStream(service.name, service.color, child.stderr);

  child.on('exit', (code) => {
    console.log(`${service.color}[${service.name}]${RESET} exited with code ${code}`);
  });

  children.push(child);
}

console.log(`
\x1b[1mAll services starting:\x1b[0m
  Task Manager:       http://localhost:3000
  Kanban Board:       http://localhost:4200
  Chat Client:        http://localhost:4201
  Agent Configurator: http://localhost:4202
  Dashboard:          http://localhost:4000
`);

// Graceful shutdown
function shutdown() {
  console.log('\n\x1b[1mShutting down all services...\x1b[0m');
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
