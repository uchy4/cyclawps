import { useState, useEffect } from 'react';
import { useAgents } from '../hooks/useAgents.js';
import { AVAILABLE_TOOLS, ROLE_COLORS } from '@app/shared';
import type { CreateAgentConfigInput } from '@app/shared';

const PRESET_COLORS = [
  '#a371f7', '#58a6ff', '#3fb950', '#d29922', '#8b949e',
  '#f97316', '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { value: '__other__', label: 'Other...' },
];

const KNOWN_MODEL_VALUES = new Set(MODELS.filter(m => m.value !== '__other__').map(m => m.value));

const TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: 'Read files',
  Write: 'Create files',
  Edit: 'Edit files',
  Bash: 'Run commands',
  Glob: 'Find files',
  Grep: 'Search content',
  WebSearch: 'Search web',
  WebFetch: 'Fetch pages',
  Agent: 'Sub-agents',
};

const inputClass = 'w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-400 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors';
const labelClass = 'block text-sm font-medium text-zinc-300 mb-1.5';

function AccordionSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          {title}
        </h3>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

interface AgentEditorProps {
  editRole: string | null;
  onSave: () => void;
  onDelete?: () => void;
}

export function AgentEditor({ editRole, onSave, onDelete }: AgentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateAgentConfigInput>({
    role: '',
    name: '',
    displayName: '',
    description: '',
    systemPrompt: '',
    model: 'claude-sonnet-4-6',
    apiKeyEnv: '',
    maxTurns: 10,
    tools: ['Read', 'Glob', 'Grep'],
    accentColor: '',
    cooldown: 5,
  });

  const { createAgent, updateAgent, getAgent, deleteAgent } = useAgents();

  useEffect(() => {
    if (editRole) {
      getAgent(editRole).then((agent) => {
        if (agent) {
          setFormData({
            role: agent.role,
            name: agent.name,
            displayName: agent.displayName || '',
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            model: agent.model,
            apiKeyEnv: agent.apiKeyEnv,
            maxTurns: agent.maxTurns,
            tools: agent.tools,
            accentColor: agent.accentColor || ROLE_COLORS[agent.role] || '',
            cooldown: agent.cooldown ?? 5,
          });
        }
      });
    }
  }, [editRole]);

  const updateField = (field: keyof CreateAgentConfigInput, value: unknown) => {
    setFormData((prev: CreateAgentConfigInput) => ({ ...prev, [field]: value }));
  };

  const toggleTool = (tool: string) => {
    const tools = formData.tools || [];
    const newTools = tools.includes(tool)
      ? tools.filter((t: string) => t !== tool)
      : [...tools, tool];
    updateField('tools', newTools);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editRole) {
        const { role, ...updates } = formData;
        await updateAgent(editRole, updates);
      } else {
        await createAgent(formData);
      }
      onSave();
    } catch (err) {
      alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editRole) return;
    if (!confirm(`Delete agent "${formData.name}"?`)) return;
    await deleteAgent(editRole);
    onDelete?.();
  };

  return (
    <div className="space-y-3">
      {/* Identity Section */}
      <AccordionSection title="Identity" defaultOpen={true}>
        <div>
          <label htmlFor="agent-name" className={labelClass}>Agent Name *</label>
          <input id="agent-name" name="name" type="text" value={formData.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g., Code Reviewer..." className={inputClass} />
        </div>
        <div>
          <label htmlFor="display-name" className={labelClass}>Display Name / Persona</label>
          <input id="display-name" name="displayName" type="text" value={formData.displayName || ''} onChange={(e) => updateField('displayName', e.target.value)} placeholder="e.g., Archie, Pam..." className={inputClass} />
          <p className="text-xs text-zinc-500 mt-1">Optional friendly name shown in the UI</p>
        </div>
        <div>
          <label htmlFor="agent-role" className={labelClass}>
            Role Identifier * {editRole && <span className="text-red-400">(read-only)</span>}
          </label>
          <input id="agent-role" name="role" type="text" value={formData.role} onChange={(e) => updateField('role', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g., code_reviewer..." disabled={!!editRole} className={`${inputClass} ${editRole ? 'opacity-50' : ''}`} />
        </div>
        <div>
          <label htmlFor="agent-description" className={labelClass}>Description</label>
          <textarea id="agent-description" name="description" value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="What does this agent do..." rows={2} className={`${inputClass} resize-y`} />
        </div>
        <div>
          <label className={labelClass}>Accent Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateField('accentColor', c)}
                className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                  formData.accentColor === c ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <div className="relative">
              <input
                type="color"
                value={formData.accentColor || '#8b949e'}
                onChange={(e) => updateField('accentColor', e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-2 [&::-webkit-color-swatch]:border-zinc-600"
                title="Custom color"
              />
            </div>
          </div>
          {formData.accentColor && (
            <div className="flex items-center gap-2 mt-2">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: formData.accentColor }} />
              <span className="text-xs text-zinc-400 font-mono">{formData.accentColor}</span>
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Model & Config Section */}
      <AccordionSection title="Model & Config">
        <div>
          <label htmlFor="agent-model" className={labelClass}>Model</label>
          <select
            id="agent-model"
            name="model"
            value={KNOWN_MODEL_VALUES.has(formData.model || '') ? formData.model : '__other__'}
            onChange={(e) => {
              if (e.target.value === '__other__') {
                updateField('model', '');
              } else {
                updateField('model', e.target.value);
              }
            }}
            className={inputClass}
          >
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {!KNOWN_MODEL_VALUES.has(formData.model || '') && (
            <input
              type="text"
              value={formData.model || ''}
              onChange={(e) => updateField('model', e.target.value)}
              placeholder="e.g., claude-sonnet-4-5, gpt-4o..."
              className={`${inputClass} mt-2`}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="api-key-env" className={labelClass}>API Key Env Var</label>
            <input id="api-key-env" name="apiKeyEnv" type="text" value={formData.apiKeyEnv || ''} onChange={(e) => updateField('apiKeyEnv', e.target.value)} placeholder={`AGENT_${(formData.role || 'ROLE').toUpperCase()}_API_KEY`} className={inputClass} />
          </div>
          <div>
            <label htmlFor="max-turns" className={labelClass}>Max Turns</label>
            <input id="max-turns" name="maxTurns" type="number" value={formData.maxTurns || 10} onChange={(e) => updateField('maxTurns', parseInt(e.target.value, 10) || 10)} min={1} max={100} className={inputClass} />
          </div>
          <div>
            <label htmlFor="cooldown" className={labelClass}>Cooldown (sec)</label>
            <input id="cooldown" name="cooldown" type="number" value={formData.cooldown ?? 5} onChange={(e) => updateField('cooldown', parseInt(e.target.value, 10) || 0)} min={0} max={300} className={inputClass} />
          </div>
        </div>
      </AccordionSection>

      {/* Tools Section */}
      <AccordionSection title="Tools">
        <div className="grid grid-cols-3 gap-2">
          {AVAILABLE_TOOLS.map((tool) => {
            const isSelected = (formData.tools || []).includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() => toggleTool(tool)}
                aria-pressed={isSelected}
                className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-orange-600/20 border border-orange-500/50 text-orange-400'
                    : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <div className="font-medium">{tool}</div>
                <div className="text-[10px] text-zinc-500">{TOOL_DESCRIPTIONS[tool] || ''}</div>
              </button>
            );
          })}
        </div>
      </AccordionSection>

      {/* System Prompt Section */}
      <AccordionSection title="System Prompt">
        <textarea
          id="system-prompt"
          name="systemPrompt"
          value={formData.systemPrompt}
          onChange={(e) => updateField('systemPrompt', e.target.value)}
          placeholder="You are a senior..."
          rows={12}
          className={`${inputClass} font-mono text-[13px] leading-relaxed resize-y`}
        />
      </AccordionSection>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-zinc-700">
        <button
          onClick={handleSave}
          disabled={saving || !formData.name || !formData.role || !formData.systemPrompt}
          className="px-6 py-2.5 rounded-lg bg-orange-600 text-white font-medium text-sm hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer"
        >
          {saving ? 'Saving...' : editRole ? 'Update Agent' : 'Create Agent'}
        </button>
        {editRole && (
          <button
            onClick={handleDelete}
            className="px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors cursor-pointer"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
