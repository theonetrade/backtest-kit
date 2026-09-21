---
title: docs/type/TDictionaryInstanceCtor
group: docs
---

# TDictionaryInstanceCtor

```ts
type TDictionaryInstanceCtor = new (signalId: string, dictionaryName: string) => IDictionaryInstance;
```

Constructor type for dictionary instance implementations.
Used for swapping backends via DictionaryBacktestAdapter / DictionaryLiveAdapter.
