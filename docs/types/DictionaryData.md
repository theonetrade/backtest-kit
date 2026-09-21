---
title: docs/type/DictionaryData
group: docs
---

# DictionaryData

```ts
type DictionaryData = {
    id: string;
    data: Record<string, {
        value: unknown;
        when: number;
    }>;
    when: number;
};
```

Type for persisted dictionary entry data.
Wraps the whole dictionary as a single snapshot: `data` maps entry keys to
`{ value, when }` records (per-entry look-ahead timestamps), the top-level
`when` is the timestamp of the last write.
