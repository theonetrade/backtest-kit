---
title: docs/class/GeneralUnexpectedError
group: docs
---

# GeneralUnexpectedError

Extends `Error`

UNEXPECTED application-level malfunction — the Java-style `Error` half of the
error/exception split: "this should never have happened; something is broken".

## Purpose: classification marker, not routing

The framework does NOT pattern-match this class anywhere — it adds no special
handling to gates, checks, or any other channel. It is the explicit counterpart
of {@link GeneralExpectedError}: where that class marks anticipated business
conditions the caller handles gracefully, this one marks genuine malfunctions
(отказ) — a bug, a broken invariant, a state that the code was written to make
impossible. Throw it where Java code would throw an `Error` / `IllegalStateException`:

- **GeneralExpectedError (and subclasses)** — anticipated, handle and continue;
- **GeneralUnexpectedError (and everything untyped)** — malfunction: abort the
  current operation, log loudly, never swallow.

Note the classification is asymmetric by design: an UNTYPED throw is already
treated as a malfunction by the "everything not Expected is a failure" rule.
This class therefore adds no new routing — it exists so a reader sees the
intent spelled out at the throw site ("this branch is a broken invariant, not
a forgotten classification"), mirroring how {@link OrderTransientError} makes
the default verdict explicit in the order triad.

```typescript
switch (position.side) {
  case "long": return closeLong(position);
  case "short": return closeShort(position);
  default:
    // Not a business outcome — a broken invariant. Deliberately unexpected.
    throw new GeneralUnexpectedError(`unknown side: ${position.side}`);
}
```

## Relation to the order-error triad

{@link OrderRejectedError}, {@link OrderDeletedError} and
{@link OrderTransientError} are CHANNEL-specific verdicts consumed by the
framework's order machinery. GeneralUnexpectedError is channel-agnostic and
framework-invisible: throwing it from a gate or check is treated like any other
non-typed throw (the "transient" verdict). Use the triad inside broker adapters;
use GeneralUnexpectedError in your own application layers.

## Nuances

- **Nominal runtime identification.** Recognized by the
  `__type__ === Symbol.for("GeneralUnexpectedError")` brand via the static
  guard — never by `instanceof`, so it survives duplicated module instances
  across bundles. Subclasses inherit the brand, so the single guard catches the
  whole family.
- The `message` is diagnostic: it is written for the developer reading the log,
  not for the user who triggered the operation — the opposite of
  {@link GeneralExpectedError}, whose message is the user-facing payload.

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

### isGeneralUnexpectedError

```ts
static isGeneralUnexpectedError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages), as well
as any subclass carrying the inherited brand.

### fromError

```ts
static fromError(error: object): GeneralUnexpectedError;
```

Nominal constructor for a new GeneralUnexpectedError from any thrown object.
Use this instead of `instanceof` to recognize instances created by a DIFFERENT
copy of this module (duplicated bundles, linked packages).
