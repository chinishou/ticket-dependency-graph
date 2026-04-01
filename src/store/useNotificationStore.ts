import { create } from 'zustand';
import type { Notification } from '../types';
import { useStore } from './useStore';

const MAX_NOTIFICATIONS = 100;

interface NotificationState {
  notifications: Notification[];
  toasts: Notification[];
  initialized: boolean;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  addToast: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeToast: (id: string) => void;
  getUnreadCount: () => number;
  getVisibleNotifications: () => Notification[];
  initNotifications: () => void;
}

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createNotification(
  data: Omit<Notification, 'id' | 'timestamp' | 'read'>
): Notification {
  return {
    ...data,
    id: generateId(),
    timestamp: new Date().toISOString(),
    read: false,
  };
}

function getStorageKey(userId: string | null, userName: string | null): string {
  const key = userId || userName || 'anonymous';
  return `tech-tree-notifications-${key}`;
}

function loadFromStorage(): Notification[] {
  if (typeof window === 'undefined') return [];
  const state = useStore.getState();
  const key = getStorageKey(state.userWorkerId, state.userName);
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { /* ignore */ }
  return [];
}

function saveToCurrentUserStorage(notifications: Notification[]) {
  if (typeof window === 'undefined') return;
  const state = useStore.getState();
  const key = getStorageKey(state.userWorkerId, state.userName);
  try {
    localStorage.setItem(key, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch { /* ignore */ }
}

function saveToTargetUserStorages(notification: Notification) {
  if (typeof window === 'undefined') return;
  if (!notification.targetUserIds || notification.targetUserIds.length === 0) return;

  for (const targetId of notification.targetUserIds) {
    const key = `tech-tree-notifications-${targetId}`;
    try {
      const stored = localStorage.getItem(key);
      let existing: Notification[] = [];
      if (stored) {
        const parsed = JSON.parse(stored);
        existing = Array.isArray(parsed) ? parsed : [];
      }
      const updated = [notification, ...existing].slice(0, MAX_NOTIFICATIONS);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch { /* ignore */ }
  }
}

function isNotificationRelevant(notification: Notification, currentUserId: string | null): boolean {
  if (!notification.targetUserIds || notification.targetUserIds.length === 0) {
    return true;
  }
  if (currentUserId !== null && notification.targetUserIds.includes(currentUserId)) {
    return true;
  }
  return false;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  toasts: [],
  initialized: false,

  initNotifications: () => {
    const loaded = loadFromStorage();
    set({ notifications: loaded, initialized: true });
  },

  addNotification: (data) => {
    const notification = createNotification(data);

    if (notification.targetUserIds && notification.targetUserIds.length > 0) {
      saveToTargetUserStorages(notification);
    }

    set((state) => {
      const newNotifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      saveToCurrentUserStorage(newNotifications);
      return { notifications: newNotifications };
    });
    get().addToast(data);
  },

  removeNotification: (id) => {
    set((state) => {
      const newNotifications = state.notifications.filter((n) => n.id !== id);
      saveToCurrentUserStorage(newNotifications);
      return { notifications: newNotifications };
    });
  },

  markAsRead: (id) => {
    set((state) => {
      const newNotifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      saveToCurrentUserStorage(newNotifications);
      return { notifications: newNotifications };
    });
  },

  markAllAsRead: () => {
    set((state) => {
      const newNotifications = state.notifications.map((n) => ({ ...n, read: true }));
      saveToCurrentUserStorage(newNotifications);
      return { notifications: newNotifications };
    });
  },

  clearAll: () => {
    saveToCurrentUserStorage([]);
    set({ notifications: [] });
  },

  addToast: (data) => {
    const toast = createNotification(data);
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));
    setTimeout(() => {
      get().removeToast(toast.id);
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  getUnreadCount: () => {
    const state = useStore.getState();
    return get().notifications.filter((n) => !n.read && isNotificationRelevant(n, state.userWorkerId)).length;
  },

  getVisibleNotifications: () => {
    const state = useStore.getState();
    return get().notifications.filter((n) => isNotificationRelevant(n, state.userWorkerId));
  },
}));

export function notifyTaskAssigned(taskName: string, assignerName: string | null, workerNames: string[], targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'task_assigned',
    title: 'Task Assigned',
    message: `${taskName} was assigned to ${workerNames.join(', ')}${assignerName ? ` by ${assignerName}` : ''}`,
    priority: 'medium',
    entityType: 'task',
    targetUserIds,
  });
}

export function notifyTaskStatusChanged(taskName: string, oldStatus: string, newStatus: string, changedBy: string | null, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'task_status_changed',
    title: 'Task Status Changed',
    message: `${taskName} changed from ${oldStatus} to ${newStatus}${changedBy ? ` by ${changedBy}` : ''}`,
    priority: 'medium',
    entityType: 'task',
    userName: changedBy ?? undefined,
    targetUserIds,
  });
}

export function notifyTaskCompleted(taskName: string, completedBy: string | null, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'task_completed',
    title: 'Task Completed',
    message: `${taskName} has been marked as completed${completedBy ? ` by ${completedBy}` : ''}`,
    priority: 'low',
    entityType: 'task',
    userName: completedBy ?? undefined,
    targetUserIds,
  });
}

export function notifyDependencyCompleted(taskName: string, unlockedTaskName: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'dependency_completed',
    title: 'Dependency Unlocked',
    message: `${taskName} completed. ${unlockedTaskName} is now available.`,
    priority: 'medium',
    entityType: 'task',
    targetUserIds,
  });
}

export function notifyMilestoneUnlocked(milestoneName: string, unlockedBy: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'milestone_unlocked',
    title: 'Milestone Unlocked',
    message: `${milestoneName} has been unlocked by ${unlockedBy}`,
    priority: 'high',
    entityType: 'milestone',
    targetUserIds,
  });
}

export function notifyLockAcquired(scope: string, lockedBy: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'lock_acquired',
    title: 'Item Locked',
    message: `${scope} was locked by ${lockedBy}`,
    priority: 'medium',
    entityType: 'lock',
    userName: lockedBy,
    targetUserIds,
  });
}

export function notifyLockReleased(scope: string, releasedBy: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'lock_released',
    title: 'Item Unlocked',
    message: `${scope} was released by ${releasedBy}`,
    priority: 'low',
    entityType: 'lock',
    userName: releasedBy,
    targetUserIds,
  });
}

export function notifyPriorityOverridden(taskName: string, setBy: string, reason: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'priority_overridden',
    title: 'Priority Overridden',
    message: `Priority for ${taskName} was overridden by ${setBy}: "${reason}"`,
    priority: 'high',
    entityType: 'task',
    userName: setBy,
    targetUserIds,
  });
}

export function notifyPriorityOverrideLifted(taskName: string, liftedBy: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'priority_override_lifted',
    title: 'Priority Override Lifted',
    message: `Priority override for ${taskName} was lifted by ${liftedBy}`,
    priority: 'medium',
    entityType: 'task',
    userName: liftedBy,
    targetUserIds,
  });
}

export function notifyCalibrationChanged(changedBy: string, targetUserIds?: string[]) {
  useNotificationStore.getState().addNotification({
    type: 'calibration_changed',
    title: 'Calibration Updated',
    message: `Priority calibration weights were updated by ${changedBy}`,
    priority: 'high',
    targetUserIds,
  });
}