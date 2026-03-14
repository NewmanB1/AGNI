# Kolibri Integration: OLS Ricecooker Chef

Upload **OLS (Open Lesson Standard)** lessons to Kolibri Studio as HTML5 App content using Ricecooker.

## Overview

| Component | Role |
|-----------|------|
| **OLS** | Single-file HTML lessons compiled from YAML |
| **Ricecooker** | Converts local HTML into Kolibri channel content |
| **Kolibri Studio** | Hosts the channel; learners import into Kolibri |

OLS lessons are self-contained HTML bundles that work offline. Kolibri expects HTML5 Apps as zips with `index.html` at root—the chef wraps each compiled HTML accordingly.

## Prerequisites

- AGNI repo with compiled lessons in `dist/`
- Python 3.8+
- [Kolibri Studio](https://studio.learningequality.org/) token

## Quick Start

```bash
# From integrations/kolibri/
pip install -r requirements.txt
./build-lessons.sh
python sushichef_ols.py --token=YOUR_STUDIO_TOKEN
```

## Options

- **OLS_DIST** – Override the HTML output directory (default: `../../dist`)
- **--thumbnails** – Auto-generate thumbnails for nodes

## Further Reading

- [Kolibri Integration Guide](../../docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md) – Ricecooker + HTML5 App flow
- [Kolibri Plugin Guide](../../docs/integrations/KOLIBRI-PLUGIN-GUIDE.md) – Native OLS content kind (Phase 2c)
- [LMS Plugins Playbook](../../docs/playbooks/lms-plugins.md)
