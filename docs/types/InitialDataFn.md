---
title: docs/type/InitialDataFn
group: docs
---

# InitialDataFn

```ts
type InitialDataFn<Data extends object = object> = (payload: InitialDispatchContract) => Data | Promise<Data>;
```

Factory form of `initialData` in `new State({ name, initialData })` — receives the
resolved signal context ({@link InitialDispatchContract}) and returns the default
state value, sync or async. Runs on every access for a signal that has no persisted
value yet, so the default can be derived from the actual entry.
