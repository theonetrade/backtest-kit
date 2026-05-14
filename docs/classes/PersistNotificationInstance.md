---
title: docs/class/PersistNotificationInstance
group: docs
---

# PersistNotificationInstance

Implements `IPersistNotificationInstance`

Default file-based implementation of IPersistNotificationInstance.

Features:
- Each notification stored as separate JSON file keyed by id
- Read iterates all keys via PersistBase.keys()
- Crash-safe via atomic writes

## Constructor

```ts
constructor(backtest: boolean);
```

## Properties

### backtest

```ts
backtest: boolean
```

### _storage

```ts
_storage: any
```

Underlying file-based storage for this mode

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readNotificationData

```ts
readNotificationData(): Promise<NotificationData>;
```

Reads all persisted notifications by iterating storage keys.

### writeNotificationData

```ts
writeNotificationData(notifications: NotificationData): Promise<void>;
```

Writes each notification as a separate entity keyed by `notification.id`.
