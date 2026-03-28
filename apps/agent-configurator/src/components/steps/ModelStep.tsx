import type { CreateAgentConfigInput } from '@app/shared';

interface ModelStepProps {
  data: CreateAgentConfigInput;
  onChange: (field: keyof CreateAgentConfigInput, value: unknown) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-md border border-zinc-700 bg-zinc-950 text-zinc-300 text-sm';

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Balanced)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Most Capable)' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Fast)' },
];

export function ModelStep({ data, onChange }: ModelStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block mb-1.5 text-[13px] text-zinc-400">
          Model
        </label>
        <select
          value={data.model}
          onChange={(e) => onChange('model', e.target.value)}
          className={inputClass}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block mb-1.5 text-[13px] text-zinc-400">
          API Key Environment Variable
        </label>
        <input
          type="text"
          value={data.apiKeyEnv || ''}
          onChange={(e) => onChange('apiKeyEnv', e.target.value)}
          placeholder={`AGENT_${(data.role || 'ROLE').toUpperCase()}_API_KEY`}
          className={inputClass}
        />
        <p className="text-xs text-zinc-500 mt-1">
          Name of the env var containing the Anthropic API key for this agent.
        </p>
      </div>
      <div>
        <label className="block mb-1.5 text-[13px] text-zinc-400">
          Max Turns
        </label>
        <input
          type="number"
          value={data.maxTurns || 10}
          onChange={(e) => onChange('maxTurns', parseInt(e.target.value, 10) || 10)}
          min={1}
          max={100}
          className={`${inputClass} !w-[120px]`}
        />
        <p className="text-xs text-zinc-500 mt-1">
          Maximum number of tool-use turns the agent can take per invocation.
        </p>
      </div>
    </div>
  );
}
