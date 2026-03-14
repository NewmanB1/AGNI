# Breaking vs Additive Changes (Y8)

Guidelines for categorizing schema, API, and behavioral changes in AGNI. Use when releasing versions, updating docs, or proposing changes.

---

## Definitions

| Type | Meaning | Examples |
|------|---------|----------|
| **Breaking** | Existing clients, lessons, or configs may fail or behave incorrectly after the change | Remove required field, change field type, rename key |
| **Additive** | New behavior or data; existing usage continues to work | New optional field, new endpoint, new step type |
| **Deprecation** | Mark for future removal; still supported for N releases | Deprecated field with replacement, deprecated flag |

---

## OLS / Lesson Schema

| Change | Category | Notes |
|--------|----------|-------|
| New optional `meta` field | Additive | Clients ignore unknown fields |
| New step type (e.g. `fill_blank`) | Additive | Old runtimes skip unknown types or show fallback |
| Remove optional field | Additive (low risk) | Clients should not rely on optional |
| Remove required field | **Breaking** | Compile/runtime may fail |
| Change `meta.creator_id` from string to object | **Breaking** | Type change |
| Rename `difficulty` → `estimated_difficulty` | **Breaking** | Rename |
| Add `yamlSchemaVersion` | Additive | Enables version checks |
| Relax validation (allow more) | Additive | |
| Stricter validation (reject previously accepted) | **Breaking** | |

---

## Hub API

| Change | Category | Notes |
|--------|----------|-------|
| New endpoint | Additive | |
| New optional query/body param | Additive | |
| Remove endpoint | **Breaking** | |
| Change response shape (remove field) | **Breaking** | |
| Add field to response | Additive | Clients ignore unknown |
| Change HTTP status for existing case | **Breaking** | |

---

## Engine / LMS

| Change | Category | Notes |
|--------|----------|-------|
| New optional state field | Additive | Migrations add defaults |
| Change merge semantics | **Breaking** | Sneakernet/federation |
| New bandit/embedding param | Additive (if optional) | |

---

## Runtime (Player, Sensors)

| Change | Category | Notes |
|--------|----------|-------|
| New sensor type | Additive | Unknown sensors ignored |
| Change `AGNI_SHARED` contract | **Breaking** | Factories depend on it |
| New optional step renderer | Additive | |

---

## Versioning Convention

- **Major (x.0.0):** Breaking changes
- **Minor (0.x.0):** Additive features, deprecations
- **Patch (0.0.x):** Bug fixes, docs, additive only

---

## Changelog Format

For each release, group entries:

```markdown
## [1.2.0] - YYYY-MM-DD

### Added
- New optional field X (additive)

### Deprecated
- Field Y; use Z instead (removal in 2.0)

### Fixed
- Bug in ...

### Breaking
- Removed support for ... (migration: ...)
```

---

## References

- [CONVENTIONS.md](CONVENTIONS.md)
- [REFERENCE-IMPLEMENTATION-VISION.md](REFERENCE-IMPLEMENTATION-VISION.md)
- [YEAR2-PREP.md](YEAR2-PREP.md)
