'use strict';

const fs = require('fs');
const path = require('path');
const plugins = require('@agni/plugins');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'system.md'), 'utf8'
);

const _arcData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../data/archetypes.json'), 'utf8')
);
const ARCHETYPES = _arcData.archetypes || _arcData;

const FACTORY_DETAILS = plugins.getFactories();
const SENSOR_DETAILS = plugins.getSensors();

function getArchetype(id) {
  return ARCHETYPES.find(function (a) { return a.id === id; });
}

function factoryOptsHint(factoryId) {
  const f = FACTORY_DETAILS.find(function (d) { return d.id === factoryId; });
  if (!f) return '';
  return '  ' + factoryId + ' opts: ' + (f.opts || []).join(', ');
}

function sensorHint(sensorId) {
  const s = SENSOR_DETAILS.find(function (d) { return d.id === sensorId; });
  if (!s) return sensorId;
  return sensorId + ' (' + s.label + ', ' + s.unit + ')';
}

function buildPrompt(lessonSpec) {
  const arch = getArchetype(lessonSpec.archetype);

  let factoryBlock = '';
  if (lessonSpec.svgFactories.length > 0) {
    factoryBlock = '\n## SVG Factories to Use\n\n' +
      lessonSpec.svgFactories.map(function (f) {
        return '- `' + f + '`' + factoryOptsHint(f);
      }).join('\n') + '\n';
  }

  let sensorBlock = '';
  if (lessonSpec.sensors.length > 0) {
    sensorBlock = '\n## Sensors Available\n\n' +
      lessonSpec.sensors.map(function (s) {
        return '- `' + sensorHint(s) + '`';
      }).join('\n') +
      '\n\nFor hardware_trigger steps, the threshold expression format is:\n' +
      '`<sensor_id> <op> <value>[unit]` e.g. `accel.total > 2.0g`, `rotation.gamma > 30`, `light > 500`\n' +
      'Operators: >, <, >=, <=\n' +
      'Special: `accel.total < 0.3g` (freefall), `accel.total steady 0.5 for 2s` (hold still)\n';
  }

  const stepPatternStr = arch.stepPattern.join(' → ');

  const prompt = `# Lesson Generation Request

## Lesson Specification

- **Subject**: ${lessonSpec.subjectLabel}
- **Grade**: ${lessonSpec.grade} (ages ${lessonSpec.ageRange})
- **Unit**: ${lessonSpec.unitTitle}
- **Topics to cover**: ${lessonSpec.topics.join(', ')}
- **Archetype**: ${lessonSpec.archetype} — "${arch.description || arch.label}"
- **Step pattern**: ${stepPatternStr}
- **Bloom's taxonomy levels**: ${lessonSpec.blooms.join(', ')}
- **Teaching mode**: ${lessonSpec.teachingMode}
- **Branching model**: ${lessonSpec.branchingModel}
- **UTU band**: ${lessonSpec.band} (Protocol P${Array.isArray(lessonSpec.protocols) ? lessonSpec.protocols[0] : lessonSpec.protocols})
- **Difficulty**: ${Math.min(5, Math.max(1, lessonSpec.band))} (1-5 scale)
- **Target duration**: ${lessonSpec.band <= 2 ? 'PT8M' : lessonSpec.band <= 4 ? 'PT12M' : 'PT18M'}
${factoryBlock}${sensorBlock}
## Archetype Design Hints

${JSON.stringify(arch.designHints || {}, null, 2)}

## Step Pattern Requirements

Follow this exact step pattern: **${stepPatternStr}**

Where \`|\` means choose one (e.g., \`quiz|fill_blank\` means use either a quiz OR a fill_blank step).

Each step MUST have:
- A unique \`id\` matching \`^[a-z0-9_-]+$\`
- The correct \`type\` from the pattern
- Meaningful \`content\` in Markdown
- For assessment steps: proper feedback with correct/incorrect messages
- For the final completion step: a summary of what was learned

## Identifier Format

Use: \`ols:${lessonSpec.subject}:${lessonSpec.unit.replace(/-/g, '_')}_v1\`

## Important

1. Output ONLY the YAML document. No fences, no explanation.
2. Every step id must be unique and lowercase with underscores/hyphens only.
3. Assessment questions must directly test the topics listed above.
4. Use culturally inclusive names and examples.
5. If using svg_spec, include a \`description\` field for accessibility.
6. Content should be written at the appropriate reading level for grade ${lessonSpec.grade}.
7. ALWAYS include a \`_gap_analysis\` section at the end of the YAML (see system prompt).
   Think hard about what SVG visuals, interactions, sensors, or step types would make
   this lesson *significantly* better if they existed. For example: would a timeline
   factory help? A drag-and-drop step type? A drawing canvas? A simulation? A video
   embed? A free-text response? An equation editor? A 3D model viewer? A map with
   real geography? Be specific — this data drives the AGNI roadmap.
`;

  return { system: SYSTEM_PROMPT, user: prompt };
}

module.exports = { buildPrompt };
