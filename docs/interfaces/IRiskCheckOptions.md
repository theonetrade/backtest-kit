---
title: docs/interface/IRiskCheckOptions
group: docs
---

# IRiskCheckOptions

Risk check options for concurrent calls.
`reserve: true` writes a placeholder into the active position map atomically with the check,
so concurrent checkSignal calls observe the incremented size before the deferred addSignal call lands.

## Properties

### reserve

```ts
reserve: boolean
```

concurrent checkSignal calls observe the incremented size before the deferred addSignal call lands.
