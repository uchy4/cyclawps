import type { CreateAgentConfigInput } from '@agents-manager/shared';

interface BasicInfoStepProps {
  data: CreateAgentConfigInput;
  onChange: (field: keyof CreateAgentConfigInput, value: unknown) => void;
  isEdit: boolean;
}

const inputClass = 'w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-950 text-slate-300 text-sm';

export function BasicInfoStep({ data, onChange, isEdit }: BasicInfoStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block mb-1.5 text-[13px] text-slate-400">
          Agent Name *
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="e.g., Code Reviewer"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block mb-1.5 text-[13px] text-slate-400">
          Display Name / Persona (Optional)
        </label>
        <input
          type="text"
          value={data.displayName || ''}
          onChange={(e) => onChange('displayName', e.target.value)}
          placeholder="e.g., Pam, Archie, Devin..."
          className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder-slate-400 text-sm"
        />
      </div>
      <div>
        <label className="block mb-1.5 text-[13px] text-slate-400">
          Role Identifier * {isEdit && <span className="text-red-400">(cannot change)</span>}
        </label>
        <input
          type="text"
          value={data.role}
          onChange={(e) => onChange('role', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          placeholder="e.g., code_reviewer"
          disabled={isEdit}
          className={`${inputClass} ${isEdit ? 'opacity-50' : ''}`}
        />
      </div>
      <div>
        <label className="block mb-1.5 text-[13px] text-slate-400">
          Description
        </label>
        <textarea
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Brief description of what this agent does..."
          rows={3}
          className={`${inputClass} resize-y font-[inherit]`}
        />
      </div>
    </div>
  );
}
