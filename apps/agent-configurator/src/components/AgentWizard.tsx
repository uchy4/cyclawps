import { useState, useEffect } from 'react';
import { useAgents } from '../hooks/useAgents.js';
import { BasicInfoStep } from './steps/BasicInfoStep.js';
import { ModelStep } from './steps/ModelStep.js';
import { ToolsStep } from './steps/ToolsStep.js';
import { PromptStep } from './steps/PromptStep.js';
import { ReviewStep } from './steps/ReviewStep.js';
import type { CreateAgentConfigInput } from '@agents-manager/shared';

const STEPS = ['Basic Info', 'Model', 'Tools', 'System Prompt', 'Review'];

interface AgentWizardProps {
  editRole: string | null;
  onClose: () => void;
}

export function AgentWizard({ editRole, onClose }: AgentWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateAgentConfigInput>({
    role: '',
    name: '',
    description: '',
    systemPrompt: '',
    model: 'claude-sonnet-4-6',
    apiKeyEnv: '',
    maxTurns: 10,
    tools: ['Read', 'Glob', 'Grep'],
  });

  const { createAgent, updateAgent, getAgent } = useAgents();

  // Load existing agent data if editing
  useEffect(() => {
    if (editRole) {
      getAgent(editRole).then((agent) => {
        if (agent) {
          setFormData({
            role: agent.role,
            name: agent.name,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            model: agent.model,
            apiKeyEnv: agent.apiKeyEnv,
            maxTurns: agent.maxTurns,
            tools: agent.tools,
          });
        }
      });
    }
  }, [editRole, getAgent]);

  const updateField = (field: keyof CreateAgentConfigInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      onClose();
    } catch (err) {
      alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Step indicator */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((name, i) => (
          <div
            key={name}
            onClick={() => setStep(i)}
            className={`flex-1 p-2.5 text-center text-[13px] cursor-pointer border-b-2 ${
              i === step ? 'font-semibold text-blue-400 border-blue-400' :
              i < step ? 'text-green-400 border-green-400' :
              'text-slate-500 border-slate-700'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && <BasicInfoStep data={formData} onChange={updateField} isEdit={!!editRole} />}
      {step === 1 && <ModelStep data={formData} onChange={updateField} />}
      {step === 2 && <ToolsStep data={formData} onChange={updateField} />}
      {step === 3 && <PromptStep data={formData} onChange={updateField} />}
      {step === 4 && <ReviewStep data={formData} />}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-md border border-slate-700 bg-transparent text-slate-300 cursor-pointer"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 rounded-md border border-slate-700 bg-transparent text-slate-300 cursor-pointer"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-4 py-2 rounded-md border-none bg-violet-600 text-white cursor-pointer"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded-md border-none text-white ${
                saving ? 'bg-slate-800 cursor-default' : 'bg-violet-600 cursor-pointer'
              }`}
            >
              {saving ? 'Saving...' : editRole ? 'Update Agent' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
