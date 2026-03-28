import type { CreateAgentConfigInput } from '@app/shared';
import { AVAILABLE_TOOLS } from '@app/shared';

interface ToolsStepProps {
  data: CreateAgentConfigInput;
  onChange: (field: keyof CreateAgentConfigInput, value: unknown) => void;
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: 'Read files from the filesystem',
  Write: 'Create new files',
  Edit: 'Make precise edits to existing files',
  Bash: 'Run terminal commands',
  Glob: 'Find files by pattern',
  Grep: 'Search file contents with regex',
  WebSearch: 'Search the web',
  WebFetch: 'Fetch and parse web pages',
  Agent: 'Invoke sub-agents',
};

export function ToolsStep({ data, onChange }: ToolsStepProps) {
  const selectedTools = data.tools || [];

  const toggleTool = (tool: string) => {
    const newTools = selectedTools.includes(tool)
      ? selectedTools.filter((t) => t !== tool)
      : [...selectedTools, tool];
    onChange('tools', newTools);
  };

  return (
    <div>
      <p className="text-[13px] text-zinc-400 mb-4">
        Select the tools this agent is allowed to use.
      </p>
      <div className="flex flex-col gap-2">
        {AVAILABLE_TOOLS.map((tool) => {
          const isSelected = selectedTools.includes(tool);
          return (
            <label
              key={tool}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md border cursor-pointer ${
                isSelected ? 'border-orange-500 bg-orange-600/5' : 'border-zinc-700 bg-transparent'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleTool(tool)}
                className="accent-orange-600"
              />
              <div>
                <div className="text-sm font-medium">{tool}</div>
                <div className="text-xs text-zinc-400">{TOOL_DESCRIPTIONS[tool] || ''}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
