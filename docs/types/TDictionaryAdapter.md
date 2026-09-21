---
title: docs/type/TDictionaryAdapter
group: docs
---

# TDictionaryAdapter

```ts
type TDictionaryAdapter = {
    [key in Exclude<keyof IDictionaryInstance, "waitForInit" | "dispose">]: any;
};
```

Public surface of DictionaryBacktestAdapter / DictionaryLiveAdapter — IDictionaryInstance minus waitForInit and dispose.
waitForInit and dispose are managed internally by the adapter.
