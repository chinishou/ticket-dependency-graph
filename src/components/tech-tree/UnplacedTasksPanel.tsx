import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Task } from '../../types';

interface UnplacedTasksPanelProps {
  goalId: string;
  onClose: () => void;
}

export function UnplacedTasksPanel({ goalId, onClose }: UnplacedTasksPanelProps) {
  const getUnplacedTasks = useStore((s) => s.getUnplacedTasks);
  const getTasksForGoal = useStore((s) => s.getTasksForGoal);
  const addTaskToGoal = useStore((s) => s.addTaskToGoal);
  const removeTaskFromGoal = useStore((s) => s.removeTaskFromGoal);
  const setSelectedTask = useStore((s) => s.setSelectedTask);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'placed' | 'unplaced' | 'new'>('placed');
  const [newName, setNewName] = useState('');
  const [newTicketId, setNewTicketId] = useState('');

  const placedTasks = getTasksForGoal(goalId);
  const unplacedTasks = getUnplacedTasks(goalId);

  const filteredPlaced = placedTasks.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) ||
           (t.ticketId && t.ticketId.toLowerCase().includes(search.toLowerCase())),
  );
  const filteredUnplaced = unplacedTasks.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) ||
           (t.ticketId && t.ticketId.toLowerCase().includes(search.toLowerCase())),
  );

  const handleAddToGoal = (task: Task) => {
    addTaskToGoal(goalId, { ...task, goalId });
  };

  const handleRemoveFromGoal = (taskId: string) => {
    removeTaskFromGoal(goalId, taskId);
  };

  const handleCreateNew = () => {
    if (!newName.trim()) return;
    const id = `task-${Date.now()}`;
    const newTask: Task = {
      id,
      goalId,
      name: newName.trim(),
      description: '',
      status: 'available',
      ticketId: newTicketId.trim() || undefined,
      contributingDepartmentId: 'dept-pipeline',
      baseDurationDays: 5,
      requiredSkills: [],
      requiredTools: [],
      dependsOnTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksTaskIds: [],
      unlocksMilestoneIds: [],
      assignedWorkerIds: [],
      parallelizationFactor: 0.7,
    };
    addTaskToGoal(goalId, newTask);
    setNewName('');
    setNewTicketId('');
    setTab('placed');
  };

  return (
    <div style={{
      position: 'absolute',
      top: 44,
      left: 12,
      width: 300,
      maxHeight: 'calc(100% - 60px)',
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      zIndex: 6,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Tickets</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '8px 12px', gap: 4 }}>
        {(['placed', 'unplaced', 'new'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '4px 0',
              border: 'none',
              borderRadius: 4,
              backgroundColor: tab === t ? 'var(--color-bg-tertiary)' : 'transparent',
              color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t === 'new' ? '+ New' : t} {t === 'placed' ? `(${placedTasks.length})` : t === 'unplaced' ? `(${unplacedTasks.length})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'new' && (
        <div style={{ padding: '0 12px 8px' }}>
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 5,
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
            }}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {tab === 'placed' && filteredPlaced.map((task) => (
          <div key={task.id} style={ticketItemStyle}>
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setSelectedTask(task.id); onClose(); }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
              {task.ticketId && <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{task.ticketId}</div>}
            </div>
            <button
              onClick={() => handleRemoveFromGoal(task.id)}
              style={{ ...tinyButtonStyle, color: 'var(--color-blocked)' }}
              title="Remove from goal"
            >
              ✕
            </button>
          </div>
        ))}

        {tab === 'unplaced' && filteredUnplaced.map((task) => (
          <div key={task.id} style={ticketItemStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
              {task.ticketId && <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{task.ticketId}</div>}
            </div>
            <button
              onClick={() => handleAddToGoal(task)}
              style={{ ...tinyButtonStyle, color: 'var(--color-done)' }}
              title="Add to goal"
            >
              +
            </button>
          </div>
        ))}

        {tab === 'unplaced' && filteredUnplaced.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: 8, textAlign: 'center' }}>
            No unplaced tickets found
          </div>
        )}

        {tab === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="Task name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
            <input
              type="text"
              placeholder="Ticket ID (optional)"
              value={newTicketId}
              onChange={(e) => setNewTicketId(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleCreateNew}
              disabled={!newName.trim()}
              style={{
                padding: '8px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: newName.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: newName.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: newName.trim() ? 'pointer' : 'default',
              }}
            >
              Create & Add to Goal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const ticketItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 5,
  marginBottom: 2,
  transition: 'background-color 0.15s',
};

const tinyButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 6px',
  lineHeight: 1,
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 5,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  outline: 'none',
};
