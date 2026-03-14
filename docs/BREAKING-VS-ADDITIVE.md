# Breaking vs Additive Changes

This document defines how OLS and AGNI distinguish **breaking** from **additive** changes. Use it when modifying schemas, APIs, or contracts.

---

## Definitions

| Type | Description | Example |
|------|-------------|---------|
| **Breaking** | Change that invalidates existing content, code, or config. Downstream must migrate. | Remove a required field; rename an endpoint |
| **Additive** | Change that extends behavior without invalidating existing usage. Optional opt-in. | Add optional meta field; new step type |

---

## Schema Changes

### Breaking (require major version bump)

- **Remove** a required field from any schema
- **Rename** a field (existing parsers won't find it)
- **Change** type of an existing field (string → number, etc.)
- **Narrow** an enum (remove a previously allowed value)
- **Add** a new required field (existing documents fail validation)

### Additive (minor/patch)

- **Add** an optional field to `meta`, steps, ontology, gate
- **Add** a new step type (`fill_blank`, `matching`, etc.) — runtime must handle unknown types gracefully
- **Add** optional schema properties with `default` or allow undefined
- **Extend** an enum with new values (old parsers ignore them)

### Migration path for breaking changes

1. Announce in CHANGELOG and release notes
2. Provide migration script or documented manual steps
3. Bump major version (e.g. 1.x → 2.0)

---

## API Contract Changes

### Breaking

- Remove an endpoint
- Change request/response shape (remove field, change type)
- Change authentication requirements (e.g. add required header)
- Change status code semantics

### Additive

- Add new endpoint
- Add optional query parameter or header
- Add optional response field
- Add new error code with distinct semantics

---

## Runtime / Compiler Changes

### Breaking

- Change IR format so old sidecars are unreadable
- Change `AGNI_SHARED` or `LESSON_DATA` global shape in incompatible way
- Remove support for a schema version (e.g. drop 1.6.0)

### Additive

- New optional IR field (consumers ignore if absent)
- New optional `LESSON_DATA` property
- Support new schema version while keeping old ones

---

## Versioning Policy

- **OLS schema:** `version` in lesson YAML (e.g. `1.8.0`). Breaking → bump major.
- **AGNI package:** Semantic versioning. Breaking → bump major (e.g. 0.x → 1.0).
- **API contract:** Document in `api-contract.md`; breaking changes require announcement and migration window.
