# AGNI Dev Start — Minimal Setup for Tests

Get the core stack running for development and testing.

## 1. Install dependencies

```bash
npm install
```

## 2. Initialize data (once)

```bash
npm run init:data
```

Creates `data/` with empty state files (creator accounts, sessions, groups, etc.).

## 3. Start the Hub API

In one terminal:

```bash
npm run start:hub:test
```

Or with your own key:

```bash
AGNI_HUB_API_KEY=your-key npm run start:hub
```

The hub listens on port **8082** by default.

## 4. Start the Portal (optional)

In another terminal:

```bash
npm run portal
```

Portal runs at **http://localhost:3000**. Configure the hub URL in Settings (default: empty; use `?hub=http://localhost:8082` or set in localStorage).

## 5. Run tests

### Unit tests (no server needed)

```bash
npm test
```

### E2E smoke tests (hub must be running)

```bash
npm run start:hub:test
# In another terminal:
npm run test:e2e:dev
```

E2E tests hit the hub on port 8082. The global setup creates an admin user in `data/` so auth-required routes work.

## Quick reference

| Command                | Description                          |
|------------------------|--------------------------------------|
| `npm run init:data`    | Initialize data dir                  |
| `npm run start:hub`    | Start hub API (set AGNI_HUB_API_KEY) |
| `npm run start:hub:test` | Start hub with test key for E2E   |
| `npm run portal`       | Serve portal on :3000                |
| `npm test`             | Unit tests                           |
| `npm run test:e2e`     | Playwright E2E (set AGNI_HUB_API_KEY)|
| `npm run test:e2e:dev` | E2E with test key pre-set            |
| `npm run verify:all`   | Full verification suite              |
