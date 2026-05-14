---
title: docs/interface/IPersistNotificationInstance
group: docs
---

# IPersistNotificationInstance

Per-context notification persistence instance interface.
Scoped to either backtest or live mode (one instance per mode).

Each notification is keyed by its id and the read operation iterates over
all stored notifications.

Custom adapters should implement this interface to override the default
file-based notification storage behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this mode.

### readNotificationData

```ts
readNotificationData: () => Promise<NotificationData>
```

Read all persisted notifications by iterating storage keys.

### writeNotificationData

```ts
writeNotificationData: (notifications: NotificationData) => Promise<void>
```

Write notifications to storage. Each notification is keyed by its id.
