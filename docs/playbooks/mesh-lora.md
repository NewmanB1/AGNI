# The Mesh: graph_weights Sync via LoRa (R9)

This playbook outlines the design for **The Mesh** — enabling Village Hubs to sync `graph_weights.json` via LoRa to share cultural adaptations between villages. It addresses roadmap item **R9**.

**Status:** Phases 1–6 implemented. UDP simulation transport; run `npm run test:mesh` or `node hub-tools/mesh.js --transport=udp`.

---

## 1. Goal and Context

| Concept | Description |
|--------|-------------|
| **The Mesh** | Peer-to-peer exchange of graph_weights between Village Hubs over LoRa radio, without requiring Starlink or USB. |
| **graph_weights** | Skill-transfer discounts for MLC ordering; produced by Sentry, consumed by theta. See `docs/playbooks/sentry.md` and `docs/playbooks/federation.md`. |
| **LoRa** | Long-range, low-power radio (typically 433/868/915 MHz). Payload limits: ~51–222 bytes per uplink packet depending on spreading factor. |

**Use case:** Villages without Starlink or regular USB visits can still receive regional or neighboring-village graph adaptations, improving lesson ordering for culturally similar cohorts.

---

## 2. LoRa Constraints

| Constraint | Typical range |
|-----------|----------------|
| **Payload per packet** | 51–222 bytes (LoRaWAN Class A uplink) |
| **Data rate** | ~0.3–50 kbps depending on SF and bandwidth |
| ** duty cycle** | Often &lt; 1% (EU868) — limits how many packets can be sent per hour |
| **Range** | 2–15 km rural; 1–5 km urban |

A full `graph_weights.json` (even a minimal one with ~10 edges) is typically **2–10 KB**. It **cannot** be sent in a single LoRa packet.

---

## 3. Architecture Options

### 3.1 Option A: Chunked Sync (Many Packets)

- **Protocol:** Serialize graph_weights to a compact binary or JSON; split into chunks of ~200 bytes; send sequence of packets with `(chunkIndex, totalChunks, payload)`.
- **Pros:** Full graph transfer; reuses existing `importInbound` semantics.
- **Cons:** Many packets; airtime and duty-cycle limits; retransmission complexity; battery impact.

### 3.2 Option B: Delta / Incremental Edges

- **Protocol:** Transmit only changed or new edges since last sync. Each packet carries one or a few edges in a compact format.
- **Pros:** Fewer packets for small updates.
- **Cons:** Requires per-peer versioning and merge semantics; conflict resolution when both hubs changed.

### 3.3 Option C: Hash + Request (Discovery Only)

- **Protocol:** Transmit only a compact summary: `(hubId, graphHash, lastUpdated, edgeCount)`. Receivers that want the full graph request it via another channel (USB, Starlink, or multi-hop LoRa relay).
- **Pros:** Minimal LoRa traffic; LoRa used for discovery/advertising only.
- **Cons:** Full graph still needs another transport; does not solve “no Starlink, no USB” alone.

### 3.4 Recommended: Hybrid

- **Phase 1:** Implement **Option C** — mesh “advertisement” packets over LoRa: hubId, graph hash, edge count, timestamp. Hubs learn what peers have.
- **Phase 2:** Add **Option B** — optional incremental edge packets when duty cycle allows; merge into `graph-weights-mesh.json` (mesh level) using the same sanitization as sync.js.
- **Phase 3:** Optional full chunked transfer (Option A) for low-traffic periods or when operator explicitly requests.

---

## 4. Integration Points

| Component | Change |
|-----------|--------|
| **sync.js** | Add `--transport=lora` path. LoRa transport does not replace Starlink/USB; it runs in parallel as a mesh listener/broadcaster. |
| **Transport abstraction** | Introduce a `Transport` interface: `send(payload)`, `onReceive(callback)`. Starlink, USB, and LoRa implement it. |
| **Import pipeline** | Mesh-received graph_weights feed the same `importInbound`-style logic: sanitize edges, write to `data/graph-weights-mesh.json` (or `graph-weights-regional.json` when level=regional). |
| **Theta** | Already uses `getEffectiveGraphWeights()` with local/regional fallback; add mesh tier if desired, or treat mesh as regional. |
| **graph_weights schema** | No change. Mesh payloads conform to `schemas/graph-weights.schema.json`; edge sanitization matches `sync.js` importInbound. |

---

## 5. Packet Formats (Sketch)

### 5.1 Advertisement Packet (Phase 1)

Compact binary or minimal JSON, &lt; 51 bytes:

```
AGNI-M1|<hubId(6)>|<graphHash(8)>|<edges(2)>|<ts(4)>
```

- `hubId`: Truncated or hashed hub ID.
- `graphHash`: First 8 bytes of SHA-256 of canonical graph JSON.
- `edges`: Edge count (uint16).
- `ts`: Unix timestamp (uint32).

### 5.2 Edge Delta Packet (Phase 2)

One or two edges per packet, ~200 bytes:

```json
{"v":1,"hubId":"...","ts":...,"edges":[{"f":"ols.math:fractions","t":"ols.math:ratios","w":0.35,"c":0.82}]}
```

Short keys (`f`,`t`,`w`,`c`) to save bytes. Schema: same semantics as graph_weights edges.

---

## 6. Implementation Phases

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| **0** | Playbook and design doc (this file) | Done |
| **1** | Transport interface; stub and UDP LoRa transports | Done |
| **2** | Unit tests (protocol, transport, peer table, merge, chunked) | Done |
| **3** | HAL: UDP simulation (real SX1276/SX1262 bindings: optional, hardware-dependent) | Done (UDP sim) |
| **4** | Advertisement broadcast + receive; mesh peer table | Done |
| **5** | Edge delta send/receive; merge into graph-weights-mesh; theta integration | Done |
| **6** | Chunked full-graph transfer | Done |
| **7** | LoRa HAL (SX1276) | Done — optional `sx127x-driver`; `--transport=lora` |

---

## 7. LoRa HAL (SX1276/77/78/79)

A hardware abstraction layer wraps **sx127x-driver** when installed. Use real LoRa hardware on Raspberry Pi with an SX1276-based LoRa HAT (e.g. RFM95, Dragino).

**Requirements:** Linux, SPI enabled (`dtparam=spi=on` in `/boot/config.txt`), GPIO for reset and DIO0.

**Install (optional):**
```bash
npm install sx127x-driver
```

**Run with real LoRa:**
```bash
node hub-tools/mesh.js --transport=lora
```

**Configuration (env or hub-config):** `AGNI_LORA_SPI_BUS`, `AGNI_LORA_SPI_DEVICE`, `AGNI_LORA_RESET_PIN`, `AGNI_LORA_DIO0_PIN`, `AGNI_LORA_FREQUENCY` (default 868e6). See `packages/agni-hub/mesh/lora-hal.js` for full opts.

**Fallback:** If `sx127x-driver` is not installed or platform is not Linux/SPI, `--transport=lora` falls back to stub with a log message. Use `--transport=udp` for simulation without hardware.

**SX1262:** No Node.js driver yet; SX1262 is compatible at the radio level if parameters match. A future HAL can wrap a C/FFI binding.

---

## 8. Security and Trust

- **Integrity:** Mesh graph_weights are unsigned by default. For trusted mesh: sign payloads with hub key; verify on receive. Same pattern as sneakernet (see `packages/agni-engine` federation).
- **Replay:** Timestamp + hubId + graphHash in advertisement; reject stale or duplicate advertisements.
- **Authority:** Mesh is peer-to-peer *signaling* of graph data. Content authority remains Hub-and-Spoke (lesson files). Mesh only shares MLC weights, not lessons.

---

## 9. References

- **Sync contracts:** `docs/playbooks/federation.md`
- **graph_weights production:** `docs/playbooks/sentry.md`
- **Theta and getEffectiveGraphWeights:** `packages/agni-hub/theta.js`
- **Import logic:** `packages/agni-hub/sync.js` — `importInbound`, graph_weights block
- **Schema:** `schemas/graph-weights.schema.json`
- **Roadmap:** `docs/ROADMAP.md` — The Mesh (R9)
