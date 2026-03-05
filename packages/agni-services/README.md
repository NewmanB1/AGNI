# @agni/services

Top-down API for hub routes: accounts, authoring, governance, LMS, lesson-chain, lesson-assembly.

## Modules

| Module | Role |
|--------|------|
| `accounts` | Creator and student accounts, sessions, transfer tokens |
| `author` | Lesson validation, preview, save, load, AI generation |
| `governance` | Policy load/save, compliance, cohort coverage (wraps @agni/governance) |
| `lms` | LMS engine proxy (delegates to @agni/engine) |
| `lesson-chain` | Content-addressed hash chain per lesson slug |
| `lesson-assembly` | Re-exports @ols/compiler lesson-assembly |
| `compiler` | Re-exports @ols/compiler compiler service |
| `lesson-schema` | Re-exports @ols/schema lesson-schema |

## Usage

```js
const { accounts, author, lessonChain } = require('@agni/services');
// Or require individual modules:
const governance = require('@agni/services/governance');
```

## Config injection

For tests or alternate data paths, use factories:

```js
const accounts = require('@agni/services/accounts');
const chain = require('@agni/services/lesson-chain');

// Default (uses envConfig.dataDir)
const defaultAccounts = accounts;
const defaultChain = chain;

// Isolated instance with custom dataDir
const testAccounts = accounts.createAccounts({ dataDir: '/tmp/test-data' });
const testChain = chain.createLessonChain({ dataDir: '/tmp/test-data' });
```

## Dependencies

- `@agni/utils` — env-config, json-store, file-lock, logger
- `@agni/governance` — policy, compliance, catalog
- `@agni/engine` — LMS engine
- `@ols/compiler` — compiler, lesson-assembly
- `@ols/schema` — lesson-schema
- `js-yaml` — YAML parsing in author service
