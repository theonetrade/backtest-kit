---
title: docs/type/Keys
group: docs
---

# Keys

```ts
type Keys = Omit<BacktestLogicPublicService, keyof {
    exchangeConnectionService: never;
    backtestLogicPrivateService: never;
    frameSchemaService: never;
    timeMetaService: never;
    loggerService: never;
}>;
```

Type definition for keys of BacktestLogicPublicService.
Omits private dependencies. Used for creating a public API surface.
