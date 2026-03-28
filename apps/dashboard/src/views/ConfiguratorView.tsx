import { useState } from 'react';
import { AgentList } from '@app/configurator/components/AgentList';
import { AgentEditor } from '@app/configurator/components/AgentEditor';
import { Drawer } from '@app/shared';

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
          key={`${editingRole}-${refreshKey}`}
          editRole={editingRole}
          onSave={handleClose}
          onDelete={handleClose}
        />
      </Drawer>
    </div>
  );
}
