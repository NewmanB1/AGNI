# Schema-to-Types and Codegen (Optional)

This playbook describes how to keep TypeScript types and runtime validators aligned with JSON schemas (OLS, graph_weights, governance policy). **Optional:** adopt when the team is ready to maintain codegen.

---

## 1. Current State

- **Schemas:** `schemas/ols.schema.json`, `schemas/graph_weights.schema.json`, `schemas/governance-policy.schema.json`
- **Types:** `packages/types/index.d.ts` — hand-written types for IR, sidecar, LMS state, governance. Not generated from schemas.
- **Validation:** Compiler and author API use Ajv with the OLS schema; governance policy is validated on load. No generated validators.

---

## 2. Validating Schemas (No Codegen)

To ensure schemas are valid JSON Schema and loadable by Ajv:

```bash
npm run codegen:validate-schemas
```

This compiles each schema with Ajv. If a schema is invalid or has unsupported keywords, the script fails. Use this in CI to catch schema regressions.

---

## 3. Generating Types from Schemas (Optional)

When you want **generated** TypeScript types so the implementation cannot drift from the spec:

1. **Install a codegen tool**, e.g.:
   ```bash
   npm install -D json-schema-to-typescript
   ```

2. **Add a script** (e.g. `scripts/codegen-types.js`) that:
   - Reads `schemas/ols.schema.json` (and optionally graph_weights, governance-policy)
   - Calls the codegen library to produce TypeScript interfaces
   - Writes to `packages/types/generated/ols.d.ts` (or similar)

3. **Wire into build:** e.g. `"codegen:types": "node scripts/codegen-types.js"` and run before `typecheck`. Then gradually replace hand-written types in `packages/types/index.d.ts` with re-exports from generated files.

4. **Caveats:**
   - Complex schemas (oneOf, conditional, refs) may need hand-tuning or schema simplification.
   - Keep generated files in `.gitignore` and regenerate in CI, or commit them and regenerate on schema change.

---

## 4. Generating Runtime Validators (Optional)

Ajv already compiles schemas at runtime in `lessonSchema.js` and `policy.js`. To **pre-compile** validators for a faster startup or to share one compiled validator:

- Use **ajv** with `compile()` and serialize the compiled function (e.g. with `ajv-pack` or a custom step) to a `.js` file that exports the validator. Then the hub loads that file instead of parsing the schema JSON each time. This is an optimization, not required for correctness.

---

## 5. References

- **Reference implementation vision:** `docs/REFERENCE-IMPLEMENTATION-VISION.md` (§2.1, §2.2)
- **Current schemas:** `schemas/*.schema.json`
- **Manual types:** `packages/types/index.d.ts`
