# 📏 OLS Threshold Expression Syntax (TES) v1.0

## 1. Overview
The Threshold Expression Syntax allows lesson authors to define physical real-world criteria that must be met to advance a lesson step. These expressions are parsed by the Player and mapped to the device's **Hardware Abstraction Layer (HAL)**.

## 2. The Grammar (EBNF)
A valid threshold expression consists of a **Subject**, an **Operator**, and a **Value** (which may include a **Unit**).

```ebnf
Expression := Subject Whitespace Operator Whitespace Value [Unit]
Subject    := Sensor | VirtualSensor
Operator   := ">" | "<" | ">=" | "<=" | "=="
Value      := Number
Unit       := "g" | "m/s2" | "deg" | "lux" | "db" | "s" | "ms"
```

## 3. Subject Definitions
The "Subject" determines which hardware API is queried.

### 3.1 Raw Sensors
Direct mapping to device hardware APIs.

| Subject | Description | Unit / Range | API Source |
| :--- | :--- | :--- | :--- |
| `accel.x`, `accel.y`, `accel.z` | Raw axis acceleration | `g` (G-force) | `DeviceMotion` |
| `accel.total` | Combined vector length | `g` | `sqrt(x^2+y^2+z^2)` |
| `gyro.alpha`, `gyro.beta`, `gyro.gamma` | Rotation rate | `deg` (Degrees) | `DeviceOrientation` |
| `light` | Ambient light level | `lux` | `AmbientLightSensor` |
| `mic` | Average volume | `db` (Decibels) | `WebAudio API` |

### 3.2 Virtual Sensors (Aliases)
Computed states for easier authoring.

| Subject | Description | Calculation Logic |
| :--- | :--- | :--- |
| `freefall` | Device is falling | `accel.total < 0.1g` |
| `steady` | Device is still | `accel.total` is between `0.9g` and `1.1g` |
| `shake` | Rapid oscillation | High-pass filter on `accel.total` > `2.5g` |
| `orientation` | Screen position | Enum: `flat`, `portrait`, `landscape` |

---

## 4. Logic & Time Semantics

The logic changes based on the **Unit** provided in the value.

### 4.1 Intensity Checks (Value-based)
If the unit is physical (`g`, `deg`, `db`, `lux`), the check passes the moment the value crosses the threshold.

*   `accel.total > 2.5g` → Passes instantly if G-force exceeds 2.5.
*   `mic > 80db` → Passes instantly if volume exceeds 80dB.

### 4.2 Duration Checks (Time-based)
If the unit is temporal (`s`, `ms`), the logic implies **"Maintain State For..."**

*   `freefall > 0.2s`
    *   *Logic:* Is `accel.total < 0.1g`? Yes.
    *   *Timer:* Start counting.
    *   *Result:* If condition remains True for 200ms, Step Passes.
*   `steady > 3s`
    *   *Logic:* User must hold the phone still for 3 seconds.

---

## 5. Valid Examples

| Expression | Explanation | Use Case |
| :--- | :--- | :--- |
| `freefall > 0.2s` | Zero-G detected for 200ms | Dropping phone on pillow |
| `accel.total > 3g` | High impact force detected | "Shake hard!" |
| `mic > 70db` | Loud noise detected | "Clap your hands" |
| `light < 10lux` | Dark room detected | "Put phone in pocket/drawer" |
| `orientation == flat` | Phone is laying on table | Calibration step |
| `gyro.beta > 45deg` | Phone tilted up | "Tilt to pour" simulation |

---

## 6. Implementation Guide (For Developers)

### Regex Parser
To parse these strings in JavaScript/Node, use this Regex:

```javascript
const THRESHOLD_REGEX = /^([a-z\.]+)\s*(>|<|>=|<=|==)\s*([0-9\.]+)(g|ms|s|deg|db|lux)?$/i;

// Example Usage
const match = "freefall > 0.2s".match(THRESHOLD_REGEX);
// match[1] = "freefall" (Subject)
// match[2] = ">"        (Operator)
// match[3] = "0.2"      (Value)
// match[4] = "s"        (Unit)
```

### Safety Rules
1.  **No `eval()`:** Never execute the string directly. Use the parsed values to configure the event listeners.
2.  **Sampling Rate:** The Player should poll sensors at **60Hz** (approx 16ms).
3.  **Noise Filter:** For `accel` checks, apply a simple Low Pass Filter (smoothing) to prevent jitter from triggering steps accidentally.

---

### 7. Next Step
Update your Schema (`ols.schema.json`) to validate against this format.

**Do you want the Regex Pattern to add to your JSON Schema now?**
