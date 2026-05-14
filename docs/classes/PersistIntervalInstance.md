---
title: docs/class/PersistIntervalInstance
group: docs
---

# PersistIntervalInstance

Implements `IPersistIntervalInstance`

Default file-based implementation of IPersistIntervalInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Soft delete via `removed: true` flag
- listIntervalData filters out removed markers

## Constructor

```ts
constructor(bucket: string);
```

## Properties

### bucket

```ts
bucket: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage for this bucket

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readIntervalData

```ts
readIntervalData(key: string): Promise<IntervalData | null>;
```

Reads an interval marker by key. Returns null if marker is missing or soft-deleted.

### writeIntervalData

```ts
writeIntervalData(data: IntervalData, key: string): Promise<void>;
```

Writes an interval marker under the given key.

### removeIntervalData

```ts
removeIntervalData(key: string): Promise<void>;
```

Soft-deletes a marker by writing `removed: true` flag while preserving the file.
Subsequent reads will return null, allowing the interval to fire again.

### listIntervalData

```ts
listIntervalData(): AsyncGenerator<string>;
```

Iterates all markers in the bucket, yielding keys of non-removed markers only.
