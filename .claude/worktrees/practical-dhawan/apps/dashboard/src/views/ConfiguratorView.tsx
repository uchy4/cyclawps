import { useState } from 'react';
import { AgentList } from '@agents-manager/configurator/components/AgentList.js';
import { AgentEditor } from '@agents-manager/configurator/components/AgentEditor.js';
import { Drawer } from '@agents-manager/shared';

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
