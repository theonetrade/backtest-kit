---
title: docs/type/DictionaryName
group: docs
---

# DictionaryName

```ts
type DictionaryName = string;
```

Logical name of a dictionary, e.g. "llm" or "levels".
Used to scope dictionary entries for different purposes within the same signal —
the name becomes the persisted file name (like `name` in Cache.file).
