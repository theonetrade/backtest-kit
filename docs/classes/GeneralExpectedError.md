---
title: docs/class/GeneralExpectedError
group: docs
---

# GeneralExpectedError

Extends `Error`

EXPECTED application-level condition — the Java-style `Exception` half of the
error/exception split: "this failure is a known, anticipated business outcome,
not a malfunction".

## Purpose: classification marker, not routing

The framework does NOT pattern-match this class anywhere — it adds no special
handling to gates, checks, or any other channel. It exists so APPLICATION code
can split its own catch blocks the way Java splits `Exception` from `Error`:

- **GeneralExpectedError (and subclasses)** — anticipated conditions the caller
  knows how to handle gracefully (validation failed, precondition not met,
  user-facing refusal with a meaningful message);
- **everything else** — a genuine malfunction (отказ): bug, broken invariant,
  unexpected infrastructure failure. Treat as fatal for the current operation,
  log loudly, do not swallow.

```typescript
try {
  await doWork();
} catch (error) {
  if (GeneralExpectedError.isGeneralExpectedError(error)) {
    notifyUser(getErrorMessage(error)); // anticipated — handle and continue
    return;
  }
  throw error; // malfunction — propagate as a failure
}
```

## Relation to the order-error triad

{@link OrderRejectedError}, {@link OrderDeletedError} and
{@link OrderTransientError} are CHANNEL-specific verdicts consumed by the
framework's order machinery. GeneralExpectedError is channel-agnostic and
framework-invisible: throwing it from a gate or check is treated like any other
non-typed throw (the "transient" verdict). Use the triad inside broker adapters;
use GeneralExpectedError in your own application layers.

## Nuances

- **Nominal runtime identification.** Recognized by the
  `__type__ === Symbol.for("GeneralExpectedError")` brand via the static guard —
  never by `instanceof`, so it survives duplicated module instances across
  bundles. Subclass it freely for domain-specific expected conditions: the brand
  is inherited, so the single guard catches the whole family.
- The `message` is the user-facing payload — unlike the order triad, where the
  message is purely informational, here it typically carries the text shown to
  the human who triggered the operation.

## Constructor

```ts
constructor(message: string);
```

## Properties

### __type__

```ts
__type__: symbol
```

Runtime brand (Symbol.for — survives duplicated module instances)

## Methods

### isGeneralExpectedError

```ts
static isGeneralExpectedError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages), as well
as any subclass carrying the inherited brand.

### fromError

```ts
static fromError(error: object): GeneralExpectedError;
```

Nominal constructor for a new GeneralExpectedError from any thrown object. Use
this instead of `instanceof` to recognize instances created by a DIFFERENT copy
of this module (duplicated bundles, linked packages).
