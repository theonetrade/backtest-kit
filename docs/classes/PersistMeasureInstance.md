---
title: docs/class/PersistMeasureInstance
group: docs
---

# PersistMeasureInstance

Implements `IPersistMeasureInstance`

Default file-based implementation of IPersistMeasureInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Soft delete via `removed: true` flag
- listMeasureData filters out removed entries

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

### readMeasureData

```ts
readMeasureData(key: string): Promise<MeasureData | null>;
```

Reads a measure entry by key. Returns null if entry is missing or soft-deleted.

### writeMeasureData

```ts
writeMeasureData(data: MeasureData, key: string): Promise<void>;
```

Writes a measure entry under the given key.

### removeMeasureData

```ts
removeMeasureData(key: string): Promise<void>;
```

Soft-deletes an entry by writing `removed: true` flag while preserving the file.

### listMeasureData

```ts
listMeasureData(): AsyncGenerator<string>;
```

Iterates all entries in the bucket, yielding keys of non-removed entries only.
