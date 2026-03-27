import { useState } from 'react';
import { AgentList } from './components/AgentList.js';
import { AgentEditor } from './components/AgentEditor.js';
import { Drawer } from '@app/shared';

export function App() {
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
    <div className="min-h-screen bg-slate-900">
      <AgentList key={refreshKey} onCreate={handleCreate} onEdit={handleEdit} />

      <Drawer
        open={drawerOpen}
        onClose={handleClose}
        title={editingRole ? 'Edit Agent' : 'New Agent'}
      >
        <AgentEditor
          editRole={editingRole}
          onSave={handleClose}
          onDelete={handleClose}
        />
      </Drawer>
    </div>
  );
}
