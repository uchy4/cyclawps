import type { CreateAgentConfigInput } from '@agents-manager/shared';

interface PromptStepProps {
  data: CreateAgentConfigInput;
  onChange: (field: keyof CreateAgentConfigInput, value: unknown) => void;
}

export function PromptStep({ data, onChange }: PromptStepProps) {
  return (
    <div>
      <label className="block mb-1.5 text-[13px] text-slate-400">
        System Prompt *
      </label>
      <p className="text-xs text-slate-500 mb-3">
        This prompt defines the agent's personality, capabilities, and behavior. Be specific about what the agent should do, how it should format output, and any constraints.
      </p>
      <textarea
        value={data.systemPrompt}
        onChange={(e) => onChange('systemPrompt', e.target.value)}
        placeholder="You are a senior..."
        rows={20}
        className="w-full p-3 rounded-md border border-slate-700 bg-slate-950 text-slate-300 text-[13px] font-mono resize-y leading-[1.5]"
      />
    </div>
  );
}
