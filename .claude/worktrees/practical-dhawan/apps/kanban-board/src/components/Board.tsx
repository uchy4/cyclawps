import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { useTasks } from '../hooks/useTasks.js';
import { Column } from './Column.js';
import { Drawer } from '@agents-manager/shared';
import { TaskEditor } from './TaskEditor.js';
import { TaskCard } from './TaskCard.js';
import { TaskLogs } from './TaskLogs.js';
import type { Task, TaskStatus, CreateTaskInput } from '@agents-manager/shared';

type DrawerTab = 'edit' | 'logs';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'To Do', color: '#8b949e' },
  { status: 'in_progress', label: 'In Progress', color: '#58a6ff' },
  { status: 'blocked', label: 'Blocked', color: '#f85149' },
  { status: 'done', label: 'Done', color: '#3fb950' },
];

const COLUMN_STATUSES = new Set(COLUMNS.map((c) => c.status));

// Prefer card slots and column-top drops over column-level droppables
const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer: slot-* (card targets) > top-* (column top) > column status
    const slotCollisions = pointerCollisions.filter((c) => String(c.id).startsWith('slot-'));
    if (slotCollisions.length > 0) return slotCollisions;
    const topCollisions = pointerCollisions.filter((c) => String(c.id).startsWith('top-'));
    if (topCollisions.length > 0) return topCollisions;
    return pointerCollisions;
  }
  const rectCollisions = rectIntersection(args);
  const slotCollisions = rectCollisions.filter((c) => String(c.id).startsWith('slot-'));
  if (slotCollisions.length > 0) return slotCollisions;
  const topCollisions = rectCollisions.filter((c) => String(c.id).startsWith('top-'));
  if (topCollisions.length > 0) return topCollisions;
  return rectCollisions;
};

export function Board({ connected, initialTaskGuid }: { connected?: boolean; initialTaskGuid?: string }) {
  const { tasks, loading, connected: wsConnected, createTask, updateTask, reorderTasks } = useTasks();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>('edit');

  // Reset tab when editing task changes
  useEffect(() => {
    setActiveTab('edit');
  }, [editingTask?.id]);

  // Deep link: open drawer for task matching initialTaskGuid
  useEffect(() => {
    if (!initialTaskGuid || loading || tasks.length === 0) return;
    const task = tasks.find((t) => t.guid === initialTaskGuid);
    if (task) {
      setEditingTask(task);
      setDrawerOpen(true);
    }
  }, [initialTaskGuid, loading, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const col of COLUMNS) {
      map[col.status] = tasks.filter((t) => t.status === col.status);
    }
    return map;
  }, [tasks]);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setDrawerOpen(true);
    if (task.guid) {
      window.history.replaceState(null, '', `/kanban/${task.guid}`);
    }
  }, []);

  const handleNewTask = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setNewTaskStatus(status);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditingTask(null);
    window.history.replaceState(null, '', '/kanban');
  }, []);

  const handleSaveTask = useCallback(async (id: string | null, data: CreateTaskInput) => {
    if (id) {
      await updateTask(id, data);
    } else {
      await createTask(data.title, data.description, data.status);
    }
  }, [createTask, updateTask]);

  const handleDeleteTask = useCallback(async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  }, [tasks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const rawOverId = over.id as string;
    const draggedTask = tasks.find((t) => t.id === activeId);
    if (!draggedTask) return;

    const isColumnDrop = COLUMN_STATUSES.has(rawOverId as TaskStatus);
    const isTopDrop = rawOverId.startsWith('top-');
    const overTaskId = rawOverId.startsWith('slot-') ? rawOverId.slice(5) : null;

    // Determine target column
    let targetStatus: TaskStatus = draggedTask.status;
    if (isColumnDrop) {
      targetStatus = rawOverId as TaskStatus;
    } else if (isTopDrop) {
      targetStatus = rawOverId.slice(4) as TaskStatus; // "top-todo" → "todo"
    } else if (overTaskId) {
      const overTask = tasks.find((t) => t.id === overTaskId);
      if (overTask) targetStatus = overTask.status;
    }

    // Build the new ordered list for the target column
    const columnTasks = [...(tasksByStatus[targetStatus] || [])];

    if (targetStatus !== draggedTask.status) {
      // Cross-column move
      let insertIndex: number;
      if (isTopDrop) {
        insertIndex = 0;
      } else if (overTaskId) {
        insertIndex = columnTasks.findIndex((t) => t.id === overTaskId);
        if (insertIndex === -1) insertIndex = columnTasks.length;
      } else {
        insertIndex = columnTasks.length;
      }
      columnTasks.splice(insertIndex, 0, draggedTask);

      // Also update sort orders for the source column (remove the gap)
      const sourceColumn = (tasksByStatus[draggedTask.status] || []).filter((t) => t.id !== activeId);
      const sourceUpdates = sourceColumn.map((t, i) => ({ id: t.id, sortOrder: i })).filter((u) => {
        const t = tasks.find((t) => t.id === u.id);
        return t && t.sortOrder !== u.sortOrder;
      });

      const targetUpdates = columnTasks.map((t, i) => ({
        id: t.id,
        sortOrder: i,
        ...(t.id === activeId ? { status: targetStatus } : {}),
      }));

      reorderTasks([...sourceUpdates, ...targetUpdates]);
    } else if ((overTaskId && overTaskId !== activeId) || isTopDrop) {
      // Same column reorder
      const oldIndex = columnTasks.findIndex((t) => t.id === activeId);
      if (oldIndex === -1) return;

      let newIndex: number;
      if (isTopDrop) {
        newIndex = 0;
      } else {
        newIndex = columnTasks.findIndex((t) => t.id === overTaskId);
        if (newIndex === -1) return;
      }

      columnTasks.splice(oldIndex, 1);
      const adjustedIndex = !isTopDrop && newIndex > oldIndex ? newIndex - 1 : newIndex;
      columnTasks.splice(adjustedIndex, 0, draggedTask);

      const updates = columnTasks
        .map((t, i) => ({ id: t.id, sortOrder: i }))
        .filter((u) => {
          const t = tasks.find((t) => t.id === u.id);
          return t && t.sortOrder !== u.sortOrder;
        });

      if (updates.length > 0) reorderTasks(updates);
    }
  }, [tasks, tasksByStatus, reorderTasks]);

  const handleDragCancel = useCallback(() => {
    setActiveTask(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <span className="animate-pulse">Loading tasks…</span>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex w-full h-full divide-x divide-slate-700/50">
          {COLUMNS.map((col) => (
            <div key={col.status} className="flex-1 min-w-[280px] px-4 first:pl-0 last:pr-0 flex flex-col h-full overflow-hidden">
              <Column
                status={col.status}
                label={col.label}
                color={col.color}
                tasks={tasksByStatus[col.status] || []}
                onClickTask={handleEditTask}
                onCreateTask={handleNewTask}
              />
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rotate-1 scale-[1.02] opacity-90">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Drawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title={editingTask ? editingTask.guid : 'New Task'}
      >
        {editingTask ? (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-slate-700 mb-4">
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'edit'
                    ? 'text-white border-b-2 border-violet-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Edit Task
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'logs'
                    ? 'text-white border-b-2 border-violet-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Logs
              </button>
            </div>

            {activeTab === 'edit' ? (
              <TaskEditor
                task={editingTask}
                onSave={handleSaveTask}
                onDelete={handleDeleteTask}
                onClose={handleCloseDrawer}
              />
            ) : (
              <TaskLogs taskGuid={editingTask.guid} />
            )}
          </>
        ) : (
          <TaskEditor
            task={null}
            defaultStatus={newTaskStatus}
            onSave={handleSaveTask}
            onDelete={handleDeleteTask}
            onClose={handleCloseDrawer}
          />
        )}
      </Drawer>
    </>
  );
}
