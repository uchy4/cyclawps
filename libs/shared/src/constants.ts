export const DEFAULT_TASK_MANAGER_PORT = 3000;
export const DEFAULT_KANBAN_PORT = 4200;
export const DEFAULT_CHAT_PORT = 4201;
export const DEFAULT_CONFIGURATOR_PORT = 4202;

export const AVAILABLE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Agent',
] as const;

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_MAX_TURNS = 10;

export const ROLE_COLORS: Record<string, string> = {
  project_manager: '#a371f7',
  architect: '#58a6ff',
  developer: '#3fb950',
  tester: '#d29922',
  grunt: '#8b949e',
  user: '#c9d1d9',
  system: '#8b949e',
};

export function formatRoleName(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
