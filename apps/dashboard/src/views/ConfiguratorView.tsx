import { useState, useEffect, useCallback } from 'react';
import { AgentList } from '@app/configurator/components/AgentList';
import { AgentEditor } from '@app/configurator/components/AgentEditor';
import { Drawer } from '@app/shared';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-400 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors';

function GeneralInstructionsEditor() {
  const [instructions, setInstructions] = useState('');
  const [savedInstructions, setSavedInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const fetchInstructions = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/general-instructions');
      const data = await res.json();
      setInstructions(data.instructions || '');
      setSavedInstructions(data.instructions || '');
    } catch (err) {
      console.error('Failed to load general instructions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstructions();
  }, [fetchInstructions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/general-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      });
      if (res.ok) {
        setSavedInstructions(instructions);
      }
    } catch (err) {
      console.error('Failed to save general instructions:', err);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = instructions !== savedInstructions;

  return (
    <div className="mx-auto max-w-4xl px-8 pt-6">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left transition-colors hover:bg-zinc-800"
      >
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            General Agent Instructions
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Shared instructions inherited by all agents — reactions, board
            management, communication style
          </p>
        </div>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : (
            <>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Enter shared instructions for all agents..."
                rows={14}
                className={`${inputClass} font-mono text-[13px] leading-relaxed resize-y`}
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  These instructions are injected into every agent's prompt
                  alongside their individual system prompt.
                </p>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className="shrink-0 ml-4 rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ConfiguratorView() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreate = () => {
    setEditingRole(null);
    setDrawerOpen(true);
  };

  const handleEdit = (role: string) => {
    setEditingRole(role);
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setEditingRole(null);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="h-full overflow-auto">
      <GeneralInstructionsEditor />
      <AgentList key={refreshKey} onCreate={handleCreate} onEdit={handleEdit} />

      <Drawer
        open={drawerOpen}
        onClose={handleClose}
        title={editingRole ? 'Edit Agent' : 'New Agent'}
      >
        <AgentEditor
          key={`${editingRole}-${refreshKey}`}
          editRole={editingRole}
          onSave={handleClose}
          onDelete={handleClose}
        />
      </Drawer>
    </div>
  );
}
