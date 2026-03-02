# @agni/plugins

**Plugin registry for AGNI** — the single source of truth for SVG factories, step type handlers, and sensor adapters.

> "I can add my thing without understanding your thing."

## Why this exists

Before this package, adding a new SVG factory required editing **5 separate files** that had to stay manually synchronised. Now the plugin registry is the single source of truth — the validator, JSON schema, and portal all read from it.

| What you're adding | Files to touch |
|---|---|
| SVG factory | `builtins/factories.js` + implementation file |
| Step type handler | `builtins/step-types.js` + renderer in player |
| Sensor adapter | `builtins/sensors.js` + adapter in sensor-bridge |

## Adding a new SVG factory

### 1. Register it (one line)

In `packages/agni-plugins/builtins/factories.js`:

```js
reg.registerFactory({
  id: 'heatmap',
  label: 'Heat Map',
  category: 'data',
  description: 'Grid of colored cells showing intensity values.',
  icon: '🟥',
  dynamic: false,
  opts: ['title', 'w', 'h', 'rows', 'cols', 'data', 'colorScale']
});
```

### 2. Write the implementation

In `packages/agni-runtime/rendering/svg-factories.js` (or a new file):

```js
SVG.heatmap = function (container, opts) {
  // ... your rendering code
};
```

### 3. Sync the JSON schema (optional, for CI)

```sh
node scripts/sync-schema-enums.js
```

That's it. The validator, portal sensor picker, and schema all pick it up automatically.

## Adding a new step type

### 1. Register it

In `packages/agni-plugins/builtins/step-types.js`:

```js
reg.registerStepType({
  type: 'drag_drop',
  label: 'Drag and Drop',
  description: 'Drag items to target zones.',
  fields: COMMON_FIELDS.concat(['items', 'targets']),
  requiredFields: ['items', 'targets']
});
```

### 2. Write the renderer

In your script (loaded after `player.js`):

```js
AGNI_SHARED.registerStepRenderer('drag_drop', function (step) {
  // render step.items and step.targets into #app
});
```

## Adding a new sensor

### 1. Register it

In `packages/agni-plugins/builtins/sensors.js`:

```js
reg.registerSensor({
  id: 'humidity',
  label: 'Humidity',
  unit: '%RH',
  group: 'Environment (Phyphox)',
  desc: 'Relative humidity from external sensor'
});
```

### 2. Wire the adapter

In your script (loaded after `sensor-bridge.js`):

```js
AGNI_SHARED.sensorBridge.registerAdapter({
  start: function (publish) {
    // subscribe to your hardware/API and call:
    //   publish('humidity', value, Date.now());
  },
  stop: function () {
    // clean up
  }
});
```

## API reference

```js
const plugins = require('@agni/plugins');

// Factories
plugins.registerFactory(descriptor)
plugins.getFactories()         // → Array<descriptor>
plugins.getFactory(id)         // → descriptor | null
plugins.getFactoryIds()        // → Set<string>
plugins.getFactoryOpts()       // → { [id]: Set<string> }
plugins.getFactoryCategories() // → string[]

// Step types
plugins.registerStepType(descriptor)
plugins.getStepTypes()         // → Array<descriptor>
plugins.getStepType(type)      // → descriptor | null
plugins.getValidStepTypes()    // → Set<string>
plugins.getValidStepFields()   // → Set<string>

// Sensors
plugins.registerSensor(descriptor)
plugins.getSensors()           // → Array<descriptor>
plugins.getSensor(id)          // → descriptor | null
plugins.getKnownSensorIds()   // → Set<string>
plugins.getSensorGroups()      // → Array<{ label, sensors[] }>
```
