# Lesson Design Prompt Stack

Structured prompt sequence for generating lessons aligned with the AGNI platform.
Designed to be used with AI or human lesson designers.

> **Important**: This prompt stack targets the AGNI runtime as built. Each prompt
> specifies the exact OLS YAML fields and system capabilities its output must map to.
> Do not design interactions the runtime cannot deliver.

---

## MASTER SYSTEM PROMPT

Use first. Defines the design constraints for every lesson.

```
You are designing lessons for AGNI, a globally deployable learning system
intended for environments ranging from well-resourced classrooms to refugee
camps using aging Android devices (Chrome 49+ / Android 6 WebView).

The system does NOT teach subjects as content.
It teaches atomic skills through observation, inference, modeling, and transformation.

A lesson:

- Teaches exactly ONE skill (declared in ontology.provides).
- Is culturally neutral and internationally portable.
- Requires minimal text.
- Prefers doing over explaining.
- Uses phone sensors (accelerometer, gyroscope, magnetometer, light, pressure, temperature)
  via the DeviceMotion API and a phyphox postMessage bridge whenever reality can be measured.
- Uses SVGFactories for data visualization and sensor-driven exploration.
  SVG visuals respond to sensor data (tilt rotates a polygon, acceleration drives a graph)
  but are NOT touch-draggable. The learner's body is the input device, not their fingers.
- Must function offline after download (service worker cached, localStorage state).
- Must degrade gracefully if sensors are unavailable: every hardware_trigger step MUST
  declare an on_fail directive that routes to a non-sensor alternative path.

Lessons must be forkable:
Local educators may wrap them in story, language, or examples,
but the cognitive core (step structure, sensor thresholds, ontology, gate) must remain invariant.

Assume learners construct knowledge from evidence — not authority.

Never include lectures.
Never include historical exposition unless it directly trains a reasoning skill.

Your job is to design the irreducible cognitive spine of the lesson,
output as valid OLS YAML (Open Lesson Standard v1.8.0).
```

---

## PROMPT 1 — DEFINE THE ATOMIC SKILL

Generates the skill target. Output maps directly to OLS `ontology` and `meta.utu`.

```
Define a single atomic skill from K-12 mathematics, science, or social reasoning.

The skill must:
- Be demonstrable through learner action (physical or digital).
- Be assessable without verbal explanation.
- Have clear pre-skills (these become ontology.requires).
- Not bundle multiple competencies.

Return (as structured YAML-ready data):

1. Skill name (verb-first, e.g. "Estimate relative magnitude from sensor data")
2. Observable mastery behavior (what the learner DOES to prove understanding)
3. Required precursor skills (array of skill IDs for ontology.requires)
4. Why this skill matters for reasoning (not careers)
5. Domain: one of MAC-1..8 (Mathematical), SCI-1..7 (Science), SOC-1..7 (Social Studies)
   — these are UTU Spine IDs. See docs/specs/utu-architecture.md for descriptions.
6. Bloom's level: one of remember, understand, apply, analyze, evaluate, create
   — this becomes meta.declared_features.blooms_level

The skill name becomes the ontology.provides[0].skill value.
The precursor skills become the ontology.requires array.
```

---

## PROMPT 2 — MAP THE SKILL INTO UTU SPACE

Places the skill in the 3D UTU coordinate system. Output maps to `meta.utu`.

```
Place the skill into UTU coordinate space.

The UTU coordinate is a triplet:
  meta.utu.class    — Spine ID (e.g. MAC-2, SCI-1, SOC-3). Pick from the canonical 22.
  meta.utu.band     — Developmental band (1–6):
                       B1–B2: Embodied/Representational (action-based, iconic reasoning)
                       B3–B4: Operational/Structural (procedural mastery → abstract relations)
                       B5–B6: Hypothetical/Formal (systemic modeling, epistemic validation)
  meta.utu.protocol — Pedagogical protocol (1–5):
                       P1 Transmission: schema acquisition (risk: Passive Familiarity Illusion)
                       P2 Guided Construction: conceptual restructuring (risk: Cognitive Flailing)
                       P3 Apprenticeship: proceduralization (risk: Mimicry)
                       P4 Dev. Sequencing: stabilization (risk: Lockstep Stagnation)
                       P5 Meaning Activation: transfer to authentic context (risk: Activity without Rigor)

Provide:
1. The UTU triplet: { class, band, protocol }
2. Band justification (based on cognitive demand, NOT age)
3. Protocol justification (which phase of mastery does this lesson target?)
4. Adjacent skills:
   - Before: what skill(s) must be mastered first (ontology.requires)
   - After: what skill(s) does mastery unlock (for the global skill graph)
5. Cross-domain bridges: does this skill connect to a different Spine?
   (e.g., a MAC skill required for a SCI investigation)

Do NOT use grade levels or ages. The band describes cognitive resolution, not birthday.
```

---

## PROMPT 3 — DESIGN THE EXPERIENCE-FIRST ENTRY

Forces epistemology before explanation. Output maps to the first 2–3 steps in the lesson.

```
Design the opening experience. This becomes the first steps of the OLS lesson.

Rules:
- No explanation. The first step type is "instruction" with observational content only.
- The learner must encounter a phenomenon through physical action.
- If sensors are available, use a "hardware_trigger" step with a threshold condition.
- You MUST also design a parallel non-sensor path for devices without sensors.

Return:
1. Step 1: Setup instructions (type: "instruction")
   - Minimal text telling the learner what to do physically
   - No theory, no definitions, no "in this lesson you will learn..."
   - May include an svg_spec for visual context

2. Step 2: Sensor interaction (type: "hardware_trigger")
   - sensor: one of accel.x, accel.magnitude, gyro.x, orientation.beta,
     rotation.alpha/beta/gamma, mag.magnitude, light, pressure, temperature
   - threshold: a condition string, e.g. "accel.magnitude > 2.5g",
     "orientation.beta > 30", "freefall > 0.4s", "steady > 1.5s"
   - on_fail: "skip_to:<fallback_step_id>" — routes to the non-sensor alternative
   - max_attempts: 3

3. Step 2b: Non-sensor fallback (type: "instruction")
   - id: the fallback_step_id referenced by on_fail
   - A physical observation activity that approximates the sensor experience
   - on_success: "skip_to:<next_shared_step>" — rejoins the main path

4. What cognitive disequilibrium should this create?
   (prediction failure, pattern surprise, counter-intuitive observation)

The threshold grammar supports:
  - Simple: "accel.total > 2.5g", "rotation.gamma > 30"
  - Duration: "steady > 1.5s", "freefall > 0.4s"
  - Compound: "accel.total < 1.0 AND freefall > 0.4s"
  - The "g" suffix converts to m/s² (×9.81)
```

---

## PROMPT 4 — SENSOR INTEGRATION

Makes measurement central. Output maps to `hardware_trigger` steps and `svg_spec` fields.

```
Integrate phone sensors into the lesson as scientific instruments, not gadgets.

Available sensors (via DeviceMotion API + phyphox bridge):

| Sensor ID          | What it measures        | Unit  | Sampling |
|--------------------|-------------------------|-------|----------|
| accel.x/y/z        | Linear acceleration     | m/s²  | fast     |
| accel.magnitude     | Total acceleration      | m/s²  | fast     |
| gyro.x/y/z         | Angular velocity        | °/s   | fast     |
| rotation.alpha/beta/gamma | Device orientation | °    | medium   |
| mag.x/y/z          | Magnetic field          | μT    | medium   |
| mag.magnitude       | Total magnetic field    | μT    | medium   |
| light               | Ambient light           | lux   | slow     |
| pressure            | Atmospheric pressure    | hPa   | slow     |
| temperature         | Device temperature      | °C    | slow     |
| sound.level         | Sound pressure          | dB    | medium   |

For each sensor interaction, define:

1. Which sensor ID is used
2. What physical variable is being measured
3. Why human intuition alone is insufficient for this observation
   (this goes in the step's "content" field as motivating text)
4. The exact physical action that generates usable data
   (e.g., "hold phone flat, then tilt slowly toward you")
5. The threshold condition that proves the observation was made
6. An svg_spec for real-time visualization during measurement:
   - Use factory "timeGraph" for continuous data streams
   - Use factory "numberLineDynamic" for single-value tracking
   - Use factory "clockFaceDynamic" for time/rotation
   - Use factory "polygonDynamic" for geometry that responds to tilt
   - Use factory "cartesianGrid" for plotting relationships
7. A non-sensor fallback activity (type: "instruction" step)
   that lets the learner approximate the observation manually

The sensor must reveal structure invisible to casual observation.
The SVG must update live from sensor data — specify opts.sensor and opts.sensorMin/sensorMax.
```

---

## PROMPT 5 — SVG FACTORY VISUAL EXPLORATION

Translates sensor data into visual structure. Output maps to `svg_spec` fields on steps.

```
Design an SVGFactory visual that lets the learner explore the structure
discovered in the sensor data.

IMPORTANT: SVG factories in AGNI are sensor-reactive and animated,
but NOT touch-draggable. The learner's body is the input:
- Tilting the phone rotates a polygon (polygonDynamic with rotateSensor)
- Shaking the phone drives a ball on a number line (numberLineDynamic with sensor)
- Walking changes a real-time graph (timeGraph with sensor streams)
- Changing orientation sweeps a unit circle angle (unitCircle with sensor)

Available factories and their key capabilities:

| Factory          | What it does                                    | Key opts                          |
|------------------|-------------------------------------------------|-----------------------------------|
| timeGraph        | Scrolling real-time multi-stream sensor graph   | streams[], sensor, scrollSpeed    |
| numberLineDynamic| Ball position driven by sensor value            | sensor, sensorMin, sensorMax      |
| polygonDynamic   | Polygon with sensor-driven rotation/scaling     | rotateSensor, scaleSensor, sides  |
| cartesianGrid    | Coordinate plane with function plots, vectors   | plots[], points[], vectors[]      |
| unitCircle       | Animated trig circle with sin/cos projections   | sensor (rotation)                 |
| clockFaceDynamic | Clock face driven by sensor or real time        | sensor, mode                      |
| arrowMap         | Animated arrows over background image           | arrows[], background              |
| compose          | Combine multiple factories into one view        | layers[]                          |
| balanceScale     | Tilting scale showing value imbalance           | left, right                       |
| barGraph         | Vertical bar chart from data                    | data[], title                     |
| venn             | 2- or 3-set Venn diagram                        | sets[], intersections             |

The SVG visual must:
1. Respond to sensor data in real time (specify opts.sensor or opts.rotateSensor)
2. Make a structural relationship visible that raw numbers cannot convey
3. Let the learner discover an invariant through physical exploration
   (e.g., "no matter how I tilt, the angle sum stays the same")
4. Pair with a hardware_trigger threshold so the visual reaches a target state
   only when the learner achieves the correct physical configuration

Do NOT design:
- Touch-drag interactions (not supported)
- Static illustrations (use sensor binding)
- Visuals that merely decorate — the SVG must be the epistemic instrument

Return a complete svg_spec block (YAML) for each visual step.
When composing multiple views, use the "compose" factory with layers[].
```

---

## PROMPT 6 — INFERENCE EXTRACTION

Forces articulation through action, not explanation. Output maps to assessed steps.

```
Create the inference moment.

The learner has now:
- Encountered a phenomenon (Prompt 3)
- Measured it with sensors (Prompt 4)
- Explored its structure visually (Prompt 5)

Now they must demonstrate understanding through action.

Design a step sequence where the learner:

1. Uses a hardware_trigger step to reproduce a specific physical state
   that only works if the concept is understood.
   (e.g., "hold the phone so the polygon shows exactly 4 equal angles"
    → threshold: "steady > 2.0s AND orientation.beta > 40 AND orientation.beta < 50")

2. OR completes an "ordering" step that sequences observations correctly
   (e.g., arrange sensor readings from lowest to highest energy state)

3. OR completes a "matching" step that pairs observed patterns with structures
   (e.g., match each tilt angle to the polygon configuration it produces)

Do NOT include explanation text.
Do NOT tell the learner what they should have figured out.
Design a task that cannot be completed without insight.

If the learner fails (max_attempts exhausted), use on_fail to route to a
scaffolding step that provides a guided retry — not an explanation.
```

---

## PROMPT 7 — ASSESSMENT (LANGUAGE-LIGHT)

Assessment must survive translation. Output maps to assessed step types.

```
Design a mastery check that works across languages and cultures.

Available assessment step types (use these, not custom formats):

| Type             | How it works                                          | Machine-checkable? |
|------------------|-------------------------------------------------------|--------------------|
| hardware_trigger | Learner achieves a physical state (sensor threshold)  | Yes (automatic)    |
| ordering         | Arrange items in correct sequence                     | Yes (correct_order) |
| matching         | Pair left↔right items                                 | Yes (pairs array)  |
| fill_blank       | Complete a statement with a word/number               | Yes (answer+accept) |
| quiz             | Multiple choice (use sparingly, as last resort)       | Yes (correct_index) |

Prefer hardware_trigger, ordering, and matching — these are "doing" assessments.
Use quiz only when no action-based alternative exists.

For open-ended demonstrations (build something, explain to a peer),
use a gate with type: "manual_verification" and a teacher prompt.

The assessment must:
1. Require no essay or specialized vocabulary
2. Be passable through construction, prediction, or physical demonstration
3. Produce a machine-checkable result (except manual_verification)
4. Assign appropriate weight (0.0–1.0) for mastery scoring
5. Include max_attempts and on_fail routing for the failure path
6. Work identically regardless of the learner's language

Return complete OLS step YAML for each assessment step.
Include the feedback object: { correct: "...", incorrect: "..." } with minimal text.
```

---

## PROMPT 8 — FORK ENVELOPE

Defines what can change vs what must stay fixed when a lesson is localized.

```
Define the Fork Envelope for this lesson.

In AGNI, lessons are forked with fork_type: "translation" | "adaptation" | "remix" | "correction".
The fork metadata is recorded but the system does not yet enforce field-level invariants.
Your job is to make the boundary explicit so translators know what is safe to change.

INVARIANT CORE — these fields MUST NOT change in a translation or adaptation:

  Step structure:
  - step.id (identifiers)
  - step.type (instruction, hardware_trigger, quiz, etc.)
  - step.sensor and step.threshold (the measured phenomenon)
  - step.weight (scoring weight)
  - step.max_attempts
  - step.on_fail and step.on_success (routing logic)
  - step.correct_index, step.correct_order, step.pairs (answer keys)
  - step.svg_spec (the visual/sensor binding — factory, opts, sensor IDs)

  Lesson structure:
  - ontology.requires and ontology.provides (skill graph edges)
  - meta.utu (the 3D coordinate — class, band, protocol)
  - meta.difficulty
  - gate structural fields (type, skill_target, passing_score, retry_delay, on_fail)
  - version

LOCALIZABLE WRAPPER — these fields MAY be changed:

  - meta.title, meta.description (translate freely)
  - meta.language, meta.locale
  - meta.authors (add translator credit)
  - step.content (the Markdown text shown to learners — translate, adapt examples)
  - step.feedback.correct and step.feedback.incorrect (translate)
  - gate.question and gate.expected_answer (translate, but preserve semantic meaning)
  - fill_blank answer/accept values (translate to target language equivalents)
  - Context framing: local materials, local measurement units (if the lesson
    mentions "meters", a fork may show "feet" — but the threshold stays in SI)

For this specific lesson, list:
1. Which content blocks need translation (by step ID)
2. Which cultural references need adaptation (and safe replacement guidance)
3. Which elements must NEVER change (cite the exact threshold, svg_spec, or answer key)
4. The fork metadata block:
   fork:
     source_identifier: <this lesson's identifier>
     source_version: "1.8.0"
     source_hash: <computed at save time>
     fork_type: "translation"
     changes: "<human-readable summary>"
```

---

## PROMPT 9 — LOW-RESOURCE VALIDATION

Ensures the lesson works in target environments.

```
Stress-test this lesson for deployment constraints:

Hardware:
- Android 6+ WebView (Chrome 49, ES5 JavaScript)
- 1 GB RAM, 480×800px screen
- Phone may be shared among 5–10 students per session
- Battery may be low; lessons should complete in under 15 minutes

Network:
- No internet after initial download (service worker caches all assets)
- Checkpoint saves to localStorage; syncs to hub when connectivity returns
- All SVG factories render locally (no CDN dependencies)

Sensors:
- Some phones lack gyroscope, magnetometer, or light sensor
- Every hardware_trigger step MUST have on_fail routing to a non-sensor path
- DeviceMotion may require a user gesture to activate (iOS Safari, some Android)

Facilitator:
- Teacher may not be a subject expert
- Teacher's role: distribute devices, observe, verify manual_verification gates
- Lesson must be self-directed — no teacher explanation required

For this lesson, verify and report:
1. Total estimated duration (must be < 15 min for shared-device scenarios)
2. Which steps require sensors? Do all have on_fail fallbacks?
3. Are all SVG factories using inline rendering (no external image URLs)?
4. Is the text minimal enough to work for low-literacy learners?
5. What happens if the lesson is interrupted mid-way?
   (checkpoint.js saves stepIndex + outcomes to localStorage automatically)
6. Required simplifications — what would you cut to fit a 5-minute window?
   (Preserve: the measured phenomenon, the transformation, the assessment.
    Cut: extra examples, bonus challenges, extended exploration.)
```

---

## PROMPT 10 — POSITION IN THE GLOBAL SKILL GRAPH

Prepares sequencing. Output maps to `ontology` and informs theta recommendations.

```
Add this lesson to the global skill graph.

The skill graph is a directed acyclic graph where:
- Nodes are skills (identified by string IDs, e.g. "estimate-magnitude", "interpret-acceleration")
- Edges are prerequisite relationships
- Each lesson declares ontology.requires (inbound edges) and ontology.provides (outbound edges)
- The theta engine uses BFS traversal to enforce prerequisites and PageRank to prioritize gateway skills

Return:

1. ontology block (valid OLS YAML):
   ontology:
     requires:
       - skill: "<prerequisite_skill_id>"
         level: 1
     provides:
       - skill: "<this_lesson_skill_id>"
         level: 1

2. Downstream unlocks: which skills does mastery of THIS skill enable?
   (These are other lessons' ontology.requires entries that reference this skill.)

3. Cross-domain bridges:
   - Does this MAC skill unlock a SCI investigation? (e.g., MAC-4 representation
     skills needed to interpret SCI-1 observation data)
   - Does this SCI skill feed a SOC analysis? (e.g., SCI-6 uncertainty management
     needed for SOC-3 evaluating authority claims)

4. Skill topology classification (derive from these heuristics):
   - Foundational: high out-degree (many skills depend on it), Bloom's remember/understand,
     UTU Protocol P1–P2, low band (B1–B2)
   - Structural: medium connectivity, Bloom's apply/analyze, Protocol P3–P4, band B3–B4
   - Applied: low out-degree (leaf or near-leaf), Bloom's evaluate/create,
     Protocol P5, high band (B5–B6)

5. Recommended theta weight: should this skill be prioritized for students
   who are stuck? (Gateway skills with high PageRank should get higher weight.)
```

---

## OUTPUT FORMAT

Each prompt should produce output that maps directly to OLS YAML v1.8.0.
The complete lesson, when assembled from all prompt outputs, should be a valid file:

```yaml
version: "1.8.0"
meta:
  identifier: "agni:<author>/<slug>"
  title: "..."
  description: "..."
  language: "en"
  difficulty: 3
  teaching_mode: "guided_discovery"
  declared_features:
    blooms_level: "apply"
    vark: ["kinesthetic", "visual"]
    teaching_style: "guided_discovery"
  utu:
    class: "SCI-1"
    band: 3
    protocol: 2
  license: "CC-BY-SA-4.0"
  authors:
    - name: "..."
ontology:
  requires:
    - skill: "prerequisite-skill-id"
      level: 1
  provides:
    - skill: "this-skill-id"
      level: 1
gate:
  type: "quiz"
  skill_target: "prerequisite-skill-id"
  passing_score: 0.8
  on_fail: "redirect:step_review"
steps:
  - id: "observe"
    type: "instruction"
    content: "..."
    svg_spec:
      factory: "timeGraph"
      opts: { ... }
  - id: "measure"
    type: "hardware_trigger"
    sensor: "accel.magnitude"
    threshold: "accel.magnitude > 2.0g"
    on_fail: "skip_to:measure_fallback"
    max_attempts: 3
    content: "..."
  - id: "measure_fallback"
    type: "instruction"
    content: "..."
    on_success: "skip_to:explore"
  - id: "explore"
    type: "instruction"
    content: "..."
    svg_spec:
      factory: "polygonDynamic"
      opts: { rotateSensor: "orientation.beta", sides: 6 }
  - id: "assess"
    type: "ordering"
    content: "..."
    items: ["...", "...", "..."]
    correct_order: [2, 0, 1]
    weight: 1.0
    max_attempts: 2
    on_fail: "skip_to:review"
    feedback:
      correct: "..."
      incorrect: "..."
```
