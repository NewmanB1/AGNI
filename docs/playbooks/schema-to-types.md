# Schema-to-Types and Codegen

This playbook describes how TypeScript types stay aligned with JSON schemas (OLS, graph_weights, governance policy). Schema-driven codegen is **implemented**.

---

## 1. Current State

- **Schemas:** `schemas/ols.schema.json`, `schemas/graph-weights.schema.json`, `schemas/governance-policy.schema.json`, `schemas/inferred-features.schema.json`, `schemas/lesson-sidecar.schema.json`, `schemas/lesson-ir.schema.json`
- **Step spec validation:** OLS uses `oneOf` with type-specific schemas (stepInstruction, stepQuiz, stepHardwareTrigger, etc.) so Ajv enforces required fields per step type (e.g. quiz requires answer_options, correct_index).
- **Generated types:** `packages/types/generated/` — TypeScript interfaces generated from schemas via `json-schema-to-typescript`
- **Hand-written types:** `packages/types/index.d.ts` — `LessonOntology` (raw YAML input), LMS state, governance report types. Re-exports generated IR/sidecar types.
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
- `inferred-features.d.ts` — inferred pedagogical features (from `schemas/inferred-features.schema.json`)
- `lesson-sidecar.d.ts` — lesson sidecar / index-ir.json (from `schemas/lesson-sidecar.schema.json`)
- `lesson-ir.d.ts` — lesson IR (from `schemas/lesson-ir.schema.json`)

**You must run this and commit** when you change any of these schemas. CI runs `verify:codegen-sync` to ensure generated files stay in sync.

**Schema-change checklist (when you change a schema):**

1. Edit the JSON Schema in `schemas/` (e.g. `lesson-ir.schema.json`, `lesson-sidecar.schema.json`).
2. Run `npm run codegen:types` to regenerate `packages/types/generated/*.d.ts`.
3. Run `npm run verify:codegen-sync` (or `verify:all`) to ensure no drift.
4. Update any code that uses the types or validated data (compiler, engine, governance, hub).
5. Commit the schema, generated types, and code changes together.

See **`docs/CONVENTIONS.md`** (§ Types and contracts, § Schema-backed JSON persistence) for when to use `createSchemaStore` vs direct Ajv.

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
