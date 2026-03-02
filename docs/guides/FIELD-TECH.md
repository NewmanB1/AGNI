# Guide: Field Technicians

How to deploy, configure, maintain, and troubleshoot an AGNI Village Hub.

---

## What is a Village Hub?

A Village Hub is a local server (typically a Raspberry Pi) that:

- Compiles and serves lessons to student phones over WiFi
- Runs the adaptive ordering engine (theta) that personalizes lesson paths
- Collects telemetry data to improve recommendations over time
- Stores all student progress, mastery data, and session information

Students connect their phones to the hub's WiFi network and open lessons in a browser. No internet is needed.

---

## Initial Deployment

See **[docs/DEPLOYMENT.md](../DEPLOYMENT.md)** for the full step-by-step setup:

1. Install Node.js 18+ on the Pi
2. Clone the AGNI repo and run `npm ci --production`
3. Set environment variables (especially `AGNI_HUB_API_KEY`)
4. Add lesson YAML files to `data/yaml/`
5. Start the hub: `node hub-tools/theta.js`
6. Start sentry (telemetry): `node hub-tools/sentry.js`
7. Set up as systemd services for auto-start on boot
8. Configure the Pi as a WiFi access point

---

## First-Run Onboarding

After starting the hub for the first time:

1. Open the portal in a browser on a device connected to the hub's WiFi.
2. Go to **Settings** and enter the hub URL (e.g. `http://192.168.4.1:8082`).
3. Go to **Admin** > **Onboarding**. The wizard detects this is a fresh hub.
4. Set the data directory and port, optionally create a default governance policy.
5. Click **Create Config**.

Then:

1. Go to **Admin** > **Accounts** to create a creator account (for teachers and governance).
2. Bulk-create student accounts under the **Students** tab.

---

## Environment Variables

All configuration goes through environment variables. Set them in your systemd unit file, `.env` file, or shell.

See **[docs/DEPLOYMENT.md](../DEPLOYMENT.md)** for the full reference table. The most important ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGNI_HUB_API_KEY` | *(none)* | **Required.** Shared secret for device-to-hub auth |
| `AGNI_DATA_DIR` | `./data` | Where all student data is stored |
| `AGNI_THETA_PORT` | `8082` | Main hub port |
| `AGNI_SENTRY_PORT` | `8081` | Telemetry port |
| `AGNI_LOG_LEVEL` | `info` | Verbosity: `debug`, `info`, `warn`, `error` |
| `AGNI_SENTRY_RETENTION_DAYS` | `90` | Days to keep telemetry files |

The canonical source of all defaults is `src/utils/env-config.js`.

---

## Routine Maintenance

### Check hub health

```bash
# Service status
sudo systemctl status agni-hub agni-sentry

# Recent logs (last hour)
sudo journalctl -u agni-hub --since "1 hour ago"

# Disk usage
du -sh /home/pi/AGNI/data/
df -h /
```

### Back up student data

```bash
# Copy the entire data directory to USB
cp -r /home/pi/AGNI/data/ /mnt/usb/agni-backup-$(date +%Y-%m-%d)/
```

Back up at least weekly. The SD card is the single point of failure.

### Update lessons

Place new YAML files in `data/yaml/`. The hub compiles them on demand — no restart required.

### Update AGNI software

```bash
cd /home/pi/AGNI
git pull
npm ci --production
sudo systemctl restart agni-hub agni-sentry
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Students can't connect | WiFi AP not running, or wrong IP | Check `hostapd` status: `sudo systemctl status hostapd`. Verify IP with `ip addr`. |
| "Hub not connected" in portal | Wrong URL in Settings | Verify the hub is running: `curl http://localhost:8082/api/health`. Check port. |
| Lessons not loading | YAML file missing or invalid | Check `data/yaml/` for the file. Run `npm run validate` to check for schema errors. Check hub logs for compilation errors. |
| Disk full | Telemetry files accumulated | Check `du -sh data/sentry-events/`. Reduce `AGNI_SENTRY_RETENTION_DAYS` and restart sentry. |
| Lock file stuck | Hub crashed mid-write | Look for `.lock` files in `data/`: `find data/ -name "*.lock"`. Delete any that are more than a few minutes old. The hub handles this automatically (stale lock timeout is 10 seconds) but a manual check can help. |
| Hub won't start | Port already in use, or bad config | Check logs: `journalctl -u agni-hub -n 50`. Common cause: another process on port 8082. Check with `lsof -i :8082`. |
| Student progress missing | Wrong `AGNI_DATA_DIR` | Verify the env var points to the right directory. Check if `data/mastery-summary.json` exists and has content. |
| Sentry not analyzing | Too few events | Analysis triggers after `AGNI_ANALYSE_AFTER` events (default 50). Check `data/sentry-events/` for `.ndjson` files. |

### Reading logs

Hub logs are structured JSON:

```json
{"ts":"2026-03-01T10:15:00Z","level":"info","component":"theta","msg":"request","method":"GET","path":"/api/theta","status":200,"durationMs":12}
```

Filter by component: `journalctl -u agni-hub | grep '"component":"theta"'`
Filter errors only: `journalctl -u agni-hub | grep '"level":"error"'`

---

## SD Card Health

SD cards wear out, especially with frequent writes. Mitigate:

- **Set sentry retention** to limit file accumulation (default 90 days).
- **Use a quality SD card** (SanDisk Extreme or Samsung EVO are reliable choices).
- **Consider read-only root**: mount `/` as read-only with a writable overlay for `data/` only.
- **Monitor disk space**: set up a cron job to alert when usage exceeds 80%.

---

## What to read next

- [Deployment guide](../DEPLOYMENT.md) — full initial setup instructions
- [Teachers guide](TEACHERS.md) — to understand what teachers see and do
- [API contract](../api-contract.md) — full list of hub HTTP endpoints
