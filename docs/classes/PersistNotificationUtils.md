---
title: docs/class/PersistNotificationUtils
group: docs
---

# PersistNotificationUtils

Utility class for managing notification persistence.

Features:
- Memoized storage instances
- Custom adapter support
- Atomic read/write operations for NotificationData
- Each notification stored as separate file keyed by id
- Crash-safe notification state management

Used by NotificationPersistLiveUtils/NotificationPersistBacktestUtils for persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistNotificationInstanceCtor

```ts
PersistNotificationInstanceCtor: any
```

Constructor used to create per-mode notification instances.
Replaceable via usePersistNotificationAdapter() / useJson() / useDummy().

### getNotificationStorage

```ts
getNotificationStorage: any
```

Memoized factory creating one IPersistNotificationInstance per mode (backtest/live).
Key: "backtest" or "live".

### readNotificationData

```ts
readNotificationData: (backtest: boolean) => Promise<NotificationData>
```

Reads persisted notifications for the given mode.
Lazily initializes the instance on first access.

### writeNotificationData

```ts
writeNotificationData: (notificationData: NotificationData, backtest: boolean) => Promise<void>
```

Writes notifications for the given mode.
Lazily initializes the instance on first access.

## Methods

### usePersistNotificationAdapter

```ts
usePersistNotificationAdapter(Ctor: TPersistNotificationInstanceCtor): void;
```

Registers a custom IPersistNotificationInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### clear

```ts
clear(): void;
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations so new
instances are created with the updated base path.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistNotificationInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistNotificationDummyInstance (all operations are no-ops).
