# Deployment Guide: Village Hub on Raspberry Pi

How to set up AGNI on a Raspberry Pi as a Village Hub serving lessons to student phones over local WiFi.

---

## Prerequisites

- **Hardware:** Raspberry Pi 3B+ or newer (1GB+ RAM), SD card (16GB+), power supply, WiFi access point (built-in or USB dongle)
- **OS:** Raspberry Pi OS Lite (64-bit recommended) or any Debian-based Linux
- **Node.js:** v18 or newer (`node --version` to check)

---

## 1. Install Node.js

```bash
# Option A: NodeSource (recommended for Pi)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs

# Option B: nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18
```

---

## 2. Clone and install

```bash
git clone https://github.com/NewmanB1/AGNI.git
cd AGNI
npm ci --production
```

---

## 3. Configure environment

Create a `.env` file or set environment variables. All variables are optional — defaults work for a single-hub deployment.

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_DATA_DIR` | `./data` | Where student data, mastery, groups, sessions are stored |
| `AGNI_YAML_DIR` | `$DATA_DIR/yaml` | Where lesson YAML source files live |
| `AGNI_HUB_API_KEY` | *(none)* | **Required.** Shared secret for device→hub API authentication. When set, all HubKey-protected endpoints (theta, telemetry, checkpoint, chain, etc.) require the `X-Hub-Key` header. When unset, those endpoints return 503. |
| `AGNI_HUB_ID` | `hub-local` | Unique identifier for this hub (used in federation) |

### Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_THETA_PORT` | `8082` | Main hub API + lesson server |
| `AGNI_SERVE_PORT` | `8080` | Static file / PWA shell server |
| `AGNI_SENTRY_PORT` | `8081` | Telemetry receiver (sentry) |

### Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_MASTERY_THRESHOLD` | `0.6` | Skill mastery cutoff (0–1) |
| `AGNI_SENTRY_RETENTION_DAYS` | `90` | Days to keep telemetry NDJSON files before pruning |
| `AGNI_ANALYSE_AFTER` | `50` | Events before triggering sentry analysis |
| `AGNI_ANALYSE_CRON` | `02:00` | Time of day for scheduled analysis |
| `AGNI_LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `AGNI_CORS_ORIGIN` | `null` | CORS origin header for API responses |

### LMS Engine

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_EMBEDDING_DIM` | `16` | Embedding vector dimension (1–1024) |
| `AGNI_FORGETTING` | `0.98` | Embedding decay factor |
| `AGNI_MARKOV_WEIGHT` | `0.15` | Weight of Markov transition in theta scoring |
| `AGNI_PAGERANK_WEIGHT` | `0.10` | Weight of PageRank in theta scoring |

### Federation / Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_SYNC_TRANSPORT` | *(empty)* | Sync transport: `starlink`, `usb`, or empty for manual |
| `AGNI_HOME_URL` | *(empty)* | Home server URL for Starlink sync |
| `AGNI_USB_PATH` | *(empty)* | Mount point for USB sneakernet sync |

---

## 4. Add lessons

Place YAML lesson files in `$AGNI_YAML_DIR` (default: `data/yaml/`). The hub compiles them on demand when a student requests a lesson.

```bash
cp lessons/gravity.yaml data/yaml/
cp lessons/ShakeRhythm.yaml data/yaml/
```

---

## 5. Start the hub

```bash
# Generate the hub API key
export AGNI_HUB_API_KEY=$(openssl rand -hex 32)
echo "Hub key: $AGNI_HUB_API_KEY"

# Start the main hub (theta + lesson server). hub-tools/ wrappers delegate to packages/agni-hub/.
node hub-tools/theta.js

# In a separate terminal (or use a process manager): start sentry
node hub-tools/sentry.js
```

The hub listens on port 8082 (theta API + lessons) and sentry on 8081 (telemetry).

---

## 6. Run as a service (systemd)

Create `/etc/systemd/system/agni-hub.service`:

```ini
[Unit]
Description=AGNI Village Hub
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/AGNI
Environment=AGNI_HUB_API_KEY=your-secret-key-here
Environment=AGNI_DATA_DIR=/home/pi/AGNI/data
ExecStart=/usr/bin/node hub-tools/theta.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create a similar unit for sentry (`agni-sentry.service`) pointing to `hub-tools/sentry.js`.

```bash
sudo systemctl enable agni-hub agni-sentry
sudo systemctl start agni-hub agni-sentry
sudo systemctl status agni-hub
```

---

## 7. Set up WiFi access point

Students connect to the Pi's WiFi to access lessons. Use `hostapd` + `dnsmasq`:

```bash
sudo apt-get install -y hostapd dnsmasq

# Configure /etc/hostapd/hostapd.conf and /etc/dnsmasq.conf
# to create a local network (e.g., SSID: "AGNI-Hub", no internet required)
```

Point the captive portal or default DNS to the Pi's IP on port 8082 so students can open `http://hub.local/` in their browser.

---

## 8. Verify

```bash
# From the Pi itself
curl http://localhost:8082/health
curl http://localhost:8081/health   # Sentry health

# From a student phone connected to the hub's WiFi
# Open: http://<pi-ip>:8082/
```

---

## SD Card Health

The Pi's SD card is the single point of failure. Mitigate:

- **Sentry retention:** Set `AGNI_SENTRY_RETENTION_DAYS` to limit telemetry file accumulation (default: 90 days).
- **Backups:** Periodically copy `$AGNI_DATA_DIR` to USB.
- **Read-only root:** Consider mounting `/` as read-only with a writable overlay for `data/`.

---

## Monitoring

Check hub health:

```bash
# Service status
sudo systemctl status agni-hub

# Recent logs
sudo journalctl -u agni-hub --since "1 hour ago"

# Disk usage
du -sh /home/pi/AGNI/data/
```

---

## References

- **Architecture:** `docs/ARCHITECTURE.md`
- **API contract:** `docs/api-contract.md`
- **Environment variables:** `src/utils/env-config.js` (canonical source of all defaults)
- **Sentry playbook:** `docs/playbooks/sentry.md`
- **Federation:** `docs/playbooks/federation.md`
