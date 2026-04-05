# Notification System

## Actions That Trigger Notifications

| # | Action | Notification Type | Recipients | Triggered In |
|---|--------|-------------------|------------|--------------|
| 1 | Task Assigned | `task_assigned` | Assigned workers only | `useStore.ts` - `updateTask()` |
| 2 | Task Status Changed | `task_status_changed` | Assigned workers only | `useStore.ts` - `updateTask()` |
| 3 | Task Completed | `task_completed` | Assigned workers only | `useStore.ts` - `updateTask()` |
| 4 | Dependency Completed | `dependency_completed` | Workers of newly-unlocked task | `useStore.ts` - `updateTask()` |
| 5 | Milestone Unlocked | `milestone_unlocked` | Workers of tasks unlocked by milestone | `useStore.ts` - `updateMilestone()` |
| 6 | Lock Acquired | `lock_acquired` | Broadcast (all users) | `useStore.ts` - `acquireLock()` |
| 7 | Lock Released | `lock_released` | Broadcast (all users) | `useStore.ts` - `releaseLock()` |
| 8 | Priority Overridden | `priority_overridden` | Assigned workers only | `useStore.ts` - `overridePriority()` |
| 9 | Priority Override Lifted | `priority_override_lifted` | Assigned workers only | `useStore.ts` - `liftPriorityOverride()` |
| 10 | Calibration Changed | `calibration_changed` | Broadcast (all users) | `useStore.ts` - `setCalibrationWeights()` |

## Notification Types

```typescript
type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'dependency_completed'
  | 'milestone_unlocked'
  | 'lock_acquired'
  | 'lock_released'
  | 'priority_overridden'
  | 'priority_override_lifted'
  | 'calibration_changed';
```

## Priority Levels

```typescript
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
```

## Storage

- Notifications are stored in localStorage with user-isolated keys
- Key format: `tech-tree-notifications-{userId}` or `tech-tree-notifications-{userName}`
- Maximum 100 notifications per user
- Targeted notifications are saved to each target user's storage

## Notification Functions

All notification functions are exported from `src/store/useNotificationStore.ts`:

- `notifyTaskAssigned(taskName, assignerName, workerNames, targetUserIds)`
- `notifyTaskStatusChanged(taskName, oldStatus, newStatus, changedBy, targetUserIds)`
- `notifyTaskCompleted(taskName, completedBy, targetUserIds)`
- `notifyDependencyCompleted(taskName, unlockedTaskName, targetUserIds)`
- `notifyMilestoneUnlocked(milestoneName, unlockedBy, targetUserIds)`
- `notifyLockAcquired(scope, lockedBy, targetUserIds)`
- `notifyLockReleased(scope, releasedBy, targetUserIds)`
- `notifyPriorityOverridden(taskName, setBy, reason, targetUserIds)`
- `notifyPriorityOverrideLifted(taskName, liftedBy, targetUserIds)`
- `notifyCalibrationChanged(changedBy, targetUserIds)`

## Components

- **NotificationCenter** (`src/components/shared/NotificationCenter.tsx`) - Bell icon dropdown with notification history
- **NotificationToast** (`src/components/shared/NotificationToast.tsx`) - Toast popups (auto-dismiss after 5s)
