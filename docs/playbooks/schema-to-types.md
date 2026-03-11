# Schema-to-Types and Codegen

This playbook describes how TypeScript types stay aligned with JSON schemas (OLS, graph_weights, governance policy). Schema-driven codegen is **implemented**.

---

## 1. Current State

- **Schemas:** `schemas/ols.schema.json`, `schemas/graph_weights.schema.json`, `schemas/governance-policy.schema.json`
- **Generated types:** `packages/types/generated/` — TypeScript interfaces generated from schemas via `json-schema-to-typescript`
- **Hand-written types:** `packages/types/index.d.ts` — IR, sidecar, LMS state (no schemas yet). Re-exports generated types where applicable (e.g. `GovernancePolicy`, `OlsLessonInput`, `GraphWeights`).
- **Validation:** Compiler and author API use Ajv with schemas at runtime. Types are for compile-time safety.

**Hardware note:** Codegen runs at build/CI time only. No runtime impact on edge devices (Android Nougat) or Village Hub (Raspberry Pi).

---

## 2. Validating Schemas

To ensure schemas are valid JSON Schema and loadable by Ajv:

```bash
npm run codegen:validate-schemas
```

This compiles each schema with Ajv. If a schema is invalid or has unsupported keywords, the script fails. Use this in CI to catch schema regressions.

---

## 3. Generating Types from Schemas

**Implemented.** To regenerate types after changing a schema:

```bash
npm run codegen:types
```

This writes to `packages/types/generated/`:
- `ols.d.ts` — validated OLS lesson YAML (from `schemas/ols.schema.json`)
- `graph-weights.d.ts` — graph weights (from `schemas/graph-weights.schema.json`)
- `governance-policy.d.ts` — governance policy (from `schemas/governance-policy.schema.json`)

**You must run this and commit** when you change any of these schemas. CI runs `verify:codegen-sync` to ensure generated files stay in sync.

**Caveats:**
- Complex schemas (oneOf, conditional, refs) may need hand-tuning. The OLS schema uses oneOf and $ref; current codegen handles them.
- Generated files are **committed** so offline devs and Pi deploys do not need to run codegen.

---

## 4. Generating Runtime Validators (Optional)

Ajv already compiles schemas at runtime in `lessonSchema.js` and `policy.js`. To **pre-compile** validators for a faster startup or to share one compiled validator:

- Use **ajv** with `compile()` and serialize the compiled function (e.g. with `ajv-pack` or a custom step) to a `.js` file that exports the validator. Then the hub loads that file instead of parsing the schema JSON each time. This is an optimization, not required for correctness.

---

## 5. References

- **Reference implementation vision:** `docs/REFERENCE-IMPLEMENTATION-VISION.md` (§2.1, §2.2)
- **Current schemas:** `schemas/*.schema.json`
- **Manual types:** `packages/types/index.d.ts`
