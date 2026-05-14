---
title: docs/class/PersistSignalInstance
group: docs
---

# PersistSignalInstance

Implements `IPersistSignalInstance`

Default file-based implementation of IPersistSignalInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses symbol as entity ID within a per-context PersistBase
- Crash-safe via atomic writes

## Constructor

```ts
constructor(symbol: string, strategyName: string, exchangeName: string);
```

## Properties

### symbol

```ts
symbol: string
```

### strategyName

```ts
strategyName: string
```

### exchangeName

```ts
exchangeName: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.
Delegates to PersistBase.waitForInit which uses singleshot.

### readSignalData

```ts
readSignalData(): Promise<ISignalRow | null>;
```

Reads the persisted signal using `symbol` as the entity key.

### writeSignalData

```ts
writeSignalData(signalRow: ISignalRow | null): Promise<void>;
```

Writes the signal (or null to clear) using `symbol` as the entity key.
