# Kolibri Integration Guide

This guide explains how to integrate **OLS (Open Lesson Standard)** lessons from AGNI into **Kolibri** by Learning Equality. Kolibri is a widely deployed offline learning platform; OLS lessons run as single-file HTML bundles, making them ideal for embedding.

---

## Overview

| Component | Role |
|-----------|------|
| **OLS** | File format and compiler — YAML lessons → HTML bundles (<500KB) that run offline with sensors (accelerometer, haptics) |
| **Kolibri** | Offline learning platform — manages channels, learners, and content delivery |
| **Ricecooker** | Kolibri content integration — converts external content into Kolibri channels |

The recommended path: **compile OLS lessons to HTML**, then add them to a Kolibri channel as **HTML5 App** nodes using Ricecooker or Kolibri Studio.

---

## Prerequisites

- AGNI repo: `git clone https://github.com/NewmanB1/AGNI.git && cd AGNI && npm ci`
- Kolibri Studio account (or self-hosted Kolibri Studio)
- Python 3.8+ (for Ricecooker)
- Ricecooker: `pip install ricecooker`

---

## Step 1: Compile OLS Lessons to HTML

OLS lessons are written in YAML. Compile them to single-file HTML:

```bash
# Compile a single lesson
node packages/agni-cli/cli.js lessons/gravity.yaml --format=html --output=dist/gravity.html

# Or compile all lessons in lessons/
for f in lessons/*.yaml; do
  slug=$(basename "$f" .yaml)
  node packages/agni-cli/cli.js "$f" --format=html --output="dist/${slug}.html"
done
```

Output files in `dist/` are **self-contained** — they include the runtime, polyfills, and lesson content. No server required. Works offline on Android 6.0+ (Chrome 44 WebView).

---

## Step 2: Host or Bundle HTML for Kolibri

Kolibri needs a URL or file path for each HTML5 App. Two options:

### Option A: Static hosting

Upload the compiled HTML to a web server or CDN. Kolibri will fetch the file during channel import.

### Option B: Local files in Ricecooker

Use `ricecooker` with `HTML5AppFile` or equivalent node type that points to the local `dist/*.html` files. Ricecooker uploads them to Kolibri Studio.

Example Ricecooker structure (pseudo-code):

```python
from ricecooker.chefs import SushiChef
from ricecooker.classes.nodes import HTML5AppNode
from ricecooker.classes.files import HTML5AppFile

class OLSChannelChef(SushiChef):
    channel_info = {
        'CHANNEL_SOURCE_DOMAIN': 'agni.dev',
        'CHANNEL_SOURCE_ID': 'ols-gravity-demo',
        'CHANNEL_TITLE': 'OLS Demo Lessons',
    }

    def construct_channel(self, **kwargs):
        channel = self.get_channel()
        # Add gravity.html as an HTML5 App
        app_file = HTML5AppFile(path='dist/gravity.html')
        app_node = HTML5AppNode(
            source_id='gravity',
            title='Feeling Gravity',
            files=[app_file],
        )
        channel.add_child(app_node)
        return channel
```

See [Ricecooker documentation](https://github.com/learningequality/ricecooker) for the exact API and node types.

---

## Step 3: Run Ricecooker

```bash
python your_ols_channel_chef.py --token=YOUR_STUDIO_TOKEN
```

This uploads the channel to Kolibri Studio. Learners then import the channel into Kolibri using the channel token.

---

## Embedding OLS in an iframe

OLS lessons can run inside an `<iframe>`. They are designed to work as embedded content:

- **Full-screen behavior:** Lessons use `viewport` and work in a constrained iframe.
- **PostMessage:** The runtime can optionally communicate with the parent via `postMessage` for progress, completion, etc.
- **Sensors:** Accelerometer, vibration, etc. require a **secure context** (HTTPS or localhost). Kolibri typically serves over HTTPS in production.

See **`demo/iframe-demo.html`** in this repo for a minimal parent page that embeds an OLS lesson.

---

## Kolibri Studio (Web UI)

If you prefer not to use Ricecooker:

1. Create a channel on [Kolibri Studio](https://studio.learningequality.org/).
2. Add an **HTML5 App** content node.
3. Upload the compiled `.html` file or provide a URL.
4. Publish the channel and share the channel token for import into Kolibri.

---

## Compatibility

| Feature | Kolibri / WebView | Notes |
|---------|-------------------|-------|
| HTML5, CSS3 | ✅ | Standard |
| Accelerometer | ✅ | Android 4+, iOS 9+; requires user gesture to request permission |
| Vibration (haptics) | ✅ | Where `navigator.vibrate` is supported |
| Offline | ✅ | OLS bundles are self-contained; Kolibri caches content offline |
| ES5 runtime | ✅ | AGNI targets Chrome 44+ for 10-year-old phones |

---

## Further Reading

- **AGNI:** [README](../../README.md), [Architecture](../ARCHITECTURE.md), [Fork and translate tutorial](../tutorials/fork-and-translate-lesson.md)
- **Kolibri:** [Documentation](https://learningequality.org/documentation/)
- **Ricecooker:** [GitHub](https://github.com/learningequality/ricecooker)

---

## Contributing

Found an issue or improvement for this guide? Open an issue or PR. See [CONTRIBUTING.md](../../CONTRIBUTING.md).
