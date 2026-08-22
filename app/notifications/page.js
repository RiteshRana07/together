"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "../../components/Nav";
import { useCurrentUser } from "../../lib/use-current-user";

function formatTime(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationSection({ label, notifications, onRead }) {
  if (!notifications.length) return null;

  return (
    <section className="notice-group">
      <p className="notice-group-label">{label}</p>

      {notifications.map((notification) => {
        const isRead = Boolean(notification.read_at);
        const icon =
          notification.type === "ended"
            ? "⌄"
            : notification.type === "join"
              ? "↗"
              : "▷";

        return (
          <button
            key={notification.id}
            type="button"
            onClick={() => onRead(notification)}
            className={`notice-row ${isRead ? "notice-read" : ""}`}
          >
            <span
              className={`notice-icon notice-icon-${notification.type || "default"}`}
              aria-hidden="true"
            >
              {icon}
            </span>

            <span className="notice-copy">
              <b>{notification.title}</b>
              <span>{notification.message}</span>
              <small>{formatTime(notification.created_at)}</small>
            </span>

            {!isRead && <span className="notice-unread-dot" aria-label="Unread" />}

            <span className="notice-mark">
              {isRead ? "" : "Mark read"}
            </span>
          </button>
        );
      })}
    </section>
  );
}

export default function NotificationsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    fetch("/api/notifications")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load notifications");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setItems(data.notifications || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const groups = useMemo(() => {
    if (!items) return { recent: [], earlier: [] };

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    return {
      recent: items.filter(
        (item) => Number(item.created_at) >= cutoff
      ),
      earlier: items.filter(
        (item) => Number(item.created_at) < cutoff
      ),
    };
  }, [items]);

  async function handleRead(notification) {
    if (!notification.read_at) {
      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notification.id }),
        });
      } catch {
        // Keep the notification usable even if the read request fails.
      }

      setItems((current) =>
        current?.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: Date.now() }
            : item
        )
      );
    }

    if (notification.room_code && notification.type !== "ended") {
      router.push(`/room/${notification.room_code}`);
    }
  }

  async function handleReadAll() {
    setBusy(true);

    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
      });
    } finally {
      setItems((current) =>
        current?.map((item) => ({
          ...item,
          read_at: item.read_at || Date.now(),
        }))
      );
      setBusy(false);
    }
  }

  if (!user) return null;

  const unreadCount = items?.filter((item) => !item.read_at).length || 0;
  const hasUnread = unreadCount > 0;

  return (
    <main className="wt-page cin-home">
      <Nav username={user.username} />

      <div className="wt-shell notice-shell">
        <header className="notice-head">
          <div>
            <p className="cin-eyebrow">
              ACTIVITY <i />
            </p>

            <h1 className="cin-display notice-title">Notifications</h1>

            <p className="notice-lead">
              Room joins, watch-party starts, and rooms that have finished —
              newest first.
            </p>

            <p className="notice-count">
              {items?.length || 0} updates <span /> <b>{unreadCount} unread</b>
            </p>
          </div>

          <button
            type="button"
            disabled={!hasUnread || busy}
            onClick={handleReadAll}
            className="wt-button wt-button-ghost notice-read-all"
          >
            ✓ &nbsp; Mark all read
          </button>
        </header>

        <div className="notice-card">
          {items === null ? (
            <div className="notice-loading">Loading activity…</div>
          ) : items.length === 0 ? (
            <div className="notice-empty">
              <div className="notice-empty-icon">♧</div>
              <h2>No notifications yet</h2>
              <p>
                Room joins, watch-party starts, and completed screenings will
                appear here.
              </p>
            </div>
          ) : (
            <>
              <NotificationSection
                label="LAST 24 HOURS"
                notifications={groups.recent}
                onRead={handleRead}
              />

              <NotificationSection
                label="EARLIER"
                notifications={groups.earlier}
                onRead={handleRead}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
