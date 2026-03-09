# Village Security Architecture

**Use this when** hardening AGNI village deployments for maximum reliability and security with minimal operational complexity. Village deployments typically lack full-time technical maintenance.

**Related:** `docs/DEPLOYMENT.md` (setup), `docs/ARCHITECTURE.md` §5 (security), `docs/playbooks/federation.md` (sync), `SECURITY.md` (vulnerability reporting).

---

## 1. System Overview

The safest design treats the village hub as a sealed appliance.

```
           ┌────────────────────┐
           │   Village Hub      │
           │   Raspberry Pi     │
           │                    │
           │  AGNI Server       │
           │  WiFi Access Point │
           │  Local Content     │
           └─────────┬──────────┘
                     │
             Village WiFi (local)
                     │
     ┌───────────────┴───────────────┐
     │                               │
┌─────────────┐               ┌─────────────┐
│ Student     │               │ Teacher     │
│ Android     │               │ Android     │
│ Device      │               │ Device      │
└─────────────┘               └─────────────┘
```

**Rules:**
- Devices connect only to hub WiFi
- Hub provides all services
- No internet connectivity required

---

## 2. Village Hub (Raspberry Pi) Hardening

The hub is the root of trust for the entire system.

### 2.1 Minimal OS

Use a minimal Raspberry Pi OS install.

**Disable:**
- Bluetooth
- Printing services
- avahi/mDNS (unless required)
- samba
- Default web servers

**Required only:**
- AGNI server (`packages/agni-hub/theta.js`, `hub-tools/sentry.js`)
- WiFi access point
- DHCP server
- DNS server

### 2.2 Firewall

Use a strict firewall. Allow only:
- HTTP/HTTPS (AGNI theta, serve, sentry ports)
- DNS
- DHCP

Block everything else.

### 2.3 WiFi Access Point

The hub should run its own WiFi network (e.g. via `hostapd` + `dnsmasq` as in `docs/DEPLOYMENT.md`).

| Setting | Recommendation |
|---------|----------------|
| SSID | AGNI-Village (or similar) |
| Security | WPA2 |
| **Client isolation** | **Required** — clients must not communicate with each other |

Client isolation enforces:
- Device → Hub ✓
- Device ✕ Device ✗

This prevents malware spreading, device scanning, and student tampering.

### 2.4 DHCP Control

The hub controls IP assignments (e.g. `192.168.50.10`–`192.168.50.200`). Reserve fixed addresses for hub, teacher devices, and admin tools.

### 2.5 DNS Lockdown

All DNS requests should resolve locally. Example: `agni.local` → hub. External DNS should be blocked so edge devices cannot access external websites.

---

## 3. Hub Filesystem Security

AGNI stores data in paths like `$AGNI_DATA_DIR` (e.g. `/opt/agni/data`), `serveDir`, `yamlDir`, `factoryDir`, `katexDir`. These must be protected.

### 3.1 Read-Only Content

Content directories should be read-only during normal operation:
- `serveDir` (lessons, factories, KaTeX)
- `factoryDir`
- `katexDir`

Only lesson import tools should temporarily unlock them.

### 3.2 Safe State Writes (Implemented)

Because Raspberry Pi uses SD cards, AGNI uses atomic write patterns:

- **LMS state:** `packages/agni-engine/index.js` writes to `lms_state.json.tmp` then renames over `lms_state.json`. A process crash mid-write cannot corrupt the state file.
- **JSON stores:** `packages/agni-utils/json-store.js` uses `.tmp + rename` for atomic writes.

Pattern: write to `.tmp` → fsync (where applicable) → rename to final path.

### 3.3 Automatic Backups

Hub should periodically snapshot:
- LMS state (`lms_state.json`)
- Student accounts
- Lesson content

Store backups in e.g. `/opt/agni/backups` with rotation (hourly, daily, weekly). See `docs/DEPLOYMENT.md` § SD Card Health for existing guidance.

---

## 4. Hub Physical Security

Village hubs are physically accessible. Protect against tampering:
- Locked enclosure
- Tamper seal
- Hidden SD card slot
- Protected power supply

Optional: read-only root filesystem to prevent malware persistence.

---

## 5. Edge Device Security Model

Edge devices (Android Marshmallow, Chrome 53 WebView) are semi-trusted. Students physically control them.

### 5.1 Device Owner Mode

Install AGNI app as Android Device Owner. Enables kiosk mode, policy enforcement, USB restrictions, WiFi control.

### 5.2 Kiosk Mode

Students should only access the AGNI learning interface. Block launcher, settings, browser, app store.

### 5.3 WiFi Lockdown

Devices should only connect to the village network:
- Allow only: AGNI-Village (or hub SSID)
- Block adding new networks
- Disable mobile data

### 5.4 USB Restrictions

Goal: USB = charging only. Disable MTP, USB debugging, ADB. USB should only be enabled via admin unlock procedure.

---

## 6. Content Integrity (Implemented)

AGNI already enforces content integrity. See `docs/ARCHITECTURE.md` §5.

- **Signed bundles:** Lessons are signed with Ed25519. The hub binds content to device UUID: `Hash(Content + NUL + UUID)` signed with hub private key. **Content** = full lesson script block (nonce bootstrap + factory-loader + `LESSON_DATA` IR + integrity globals + player.js), not just IR JSON. The HTML wrapper, `<style>` block, and external factory files (shared-runtime, integrity.js, etc.) are **not** signed — they must be served from trusted paths. See `packages/agni-utils/crypto.js` and `packages/agni-runtime/integrity/integrity.js`.
- **Runtime verification:** `packages/agni-runtime/ui/player.js` implements `verifyIntegrity()` — checks identity (intended owner) and integrity (signature).
- **Implementation:** `packages/agni-utils/crypto.js`, `lessonAssembly` (shared by CLI and hub-transform).

This prevents P2P cloning and malicious lesson edits.

---

## 7. Federation Security

Federation via USB or Starlink between hubs must be controlled. See `docs/playbooks/federation.md`.

**Mitigations:**
- **Hub identity:** Each hub has unique `AGNI_HUB_ID`. Duplicate IDs corrupt sync attribution.
- **usbPath contract:** `env-config.USB_SAFE_ROOT` restricts writes to `/mnt/usb` — sync cannot write anywhere on disk.
- **Future:** Signed federation bundles (hubId, signature, timestamp) for receiving hub verification before merge.

---

## 8. Edge Device Authentication

AGNI uses `X-Hub-Key` for API authentication. When `AGNI_HUB_API_KEY` is set, all HubKey-protected endpoints require the header. See `docs/playbooks/hub.md` and `docs/DEPLOYMENT.md`.

Device registration and per-device tokens are not yet implemented but could strengthen the model.

---

## 9. Network Monitoring

Hub should log device connections, API requests, and errors. Logs help diagnose broken devices, suspicious behaviour, and learning anomalies.

Logs should rotate to avoid SD card exhaustion (e.g. via `logrotate` or `journalctl` retention).

---

## 10. Maintenance Model

Village deployments must be maintainable by non-experts.

**Admin USB key (recommended):** A special USB key containing a signed admin bundle. When inserted into the hub, enables maintenance mode, unlocks admin interface, and allows updates.

---

## 11. Failure Handling

| Failure | Mitigation |
|---------|------------|
| Hub crash | Edge devices display "Hub unavailable"; reconnect when network returns |
| State corruption | Hub loads latest backup; `packages/agni-engine/migrations.js` repairs on load; CLI supports `lms-repair` |

---

## 12. The Three Most Important Safeguards

If implementing only a few protections, prioritize:

1. **Hub hardening** — hub compromise compromises everything.
2. **Safe state writes + backups** — prevents SD card corruption from destroying learning data. AGNI implements atomic writes; add backups per `docs/DEPLOYMENT.md`.
3. **Edge device kiosk lockdown** — prevents students bypassing restrictions.

---

## Summary Checklist

| Area | Status |
|------|--------|
| Hub hardening (firewall, minimal services) | Operator responsibility |
| WiFi client isolation | Operator (hostapd config) |
| Safe state writes | ✓ Implemented (`packages/agni-engine`, `packages/agni-utils/json-store.js`) |
| Signed lesson bundles | ✓ Implemented (Ed25519, player verifyIntegrity) |
| usbPath safe root | ✓ Implemented (env-config, sync validation) |
| Edge kiosk / Device Owner | Operator (Android MDM) |
| Automated backups | Operator (cron, scripts) |
