import type { CreateAgentConfigInput } from '@cyclawps/shared';

interface ReviewStepProps {
  data: CreateAgentConfigInput;
}

export function ReviewStep({ data }: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Review Agent Configuration</h2>

      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
        <Row label="Name" value={data.name} />
        <Row label="Display Name" value={data.displayName || '(none)'} />
        <Row label="Role" value={data.role} />
        <Row label="Description" value={data.description || '(none)'} />
        <Row label="Model" value={data.model || 'claude-sonnet-4-6'} />
        <Row label="API Key Env" value={data.apiKeyEnv || `AGENT_${(data.role || '').toUpperCase()}_API_KEY`} />
        <Row label="Max Turns" value={String(data.maxTurns || 10)} />
        <Row label="Tools" value={(data.tools || []).join(', ') || '(none)'} />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">System Prompt</h3>
        <pre className="p-3 rounded-md bg-slate-950 border border-slate-700 text-xs leading-[1.5] whitespace-pre-wrap max-h-[300px] overflow-auto">
          {data.systemPrompt || '(empty)'}
        </pre>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex py-1.5 border-b border-slate-800">
      <span className="w-[140px] text-[13px] text-slate-400">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}
