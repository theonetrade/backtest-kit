---
title: docs/interface/ICacheCandlesParams
group: docs
---

# ICacheCandlesParams

Parameters for the combined check-then-warm caching flow.
Extends both validation and pre-cache parameter sets and adds
lifecycle callbacks invoked before each phase of the flow.

## Properties

### onWarmStart

```ts
onWarmStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void
```

Invoked before the cache validation phase starts

### onCheckStart

```ts
onCheckStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void
```

Invoked before the cache warm-up phase starts (after a validation miss)
