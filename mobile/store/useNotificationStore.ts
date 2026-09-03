import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "../services/api";

export type NotificationType = "scan_find" | "system_update" | "deal_alert" | "info";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  product?: Product;
  actionUrl?: string;
}

interface NotificationStore {
  notifications: AppNotification[];
  activeToast: AppNotification | null;
  unreadCount: number;

  loadNotifications: () => Promise<void>;
  addNotification: (
    notif: Omit<AppNotification, "id" | "timestamp" | "read"> & { id?: string }
  ) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  dismissToast: () => void;
}

const STORAGE_KEY = "@streamsnap_notifications";

const INITIAL_UPDATES: AppNotification[] = [
  {
    id: "welcome-v1.2",
    type: "system_update",
    title: "⚡ StreamSnap Live Scan is Active!",
    message:
      "You can now scan TikTok and YouTube live in the background without taking screenshots. Tap 'Live Scan' on the home screen to test it.",
    timestamp: Date.now() - 1000 * 60 * 30, // 30 mins ago
    read: false
  },
  {
    id: "cloud-sync-ready",
    type: "info",
    title: "☁️ Cross-Device Cloud Sync",
    message:
      "Sign in with Google in Settings to sync your saved Amazon finds and cart across all your devices.",
    timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
    read: false
  }
];

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  activeToast: null,
  unreadCount: 0,

  loadNotifications: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let list: AppNotification[] = raw ? JSON.parse(raw) : INITIAL_UPDATES;
      if (!raw) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
      const unread = list.filter((n) => !n.read).length;
      set({ notifications: list, unreadCount: unread });
    } catch {
      set({ notifications: INITIAL_UPDATES, unreadCount: INITIAL_UPDATES.length });
    }
  },

  addNotification: async (notif) => {
    const newItem: AppNotification = {
      id: notif.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      timestamp: Date.now(),
      read: false,
      product: notif.product,
      actionUrl: notif.actionUrl
    };

    const updated = [newItem, ...get().notifications.filter((n) => n.id !== newItem.id)].slice(
      0,
      100
    );
    const unread = updated.filter((n) => !n.read).length;

    set({
      notifications: updated,
      activeToast: newItem,
      unreadCount: unread
    });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to persist notification", e);
    }
  },

  markAsRead: async (id: string) => {
    const updated = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    const unread = updated.filter((n) => !n.read).length;
    set({ notifications: updated, unreadCount: unread });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  },

  markAllAsRead: async () => {
    const updated = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  },

  clearAll: async () => {
    set({ notifications: [], unreadCount: 0 });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
  },

  dismissToast: () => {
    set({ activeToast: null });
  }
}));
