# Guide: Governance Authorities

How to set education policy, manage the approved lesson catalog, and ensure curriculum compliance for your school or district.

---

## What is governance in AGNI?

AGNI lets communities control their own curriculum. As a governance authority (curriculum director, school board, district coordinator), you define:

- **What subjects and skills** lessons must cover (UTU targets)
- **What teaching methods** are allowed (didactic, socratic, guided discovery, etc.)
- **What difficulty range** is appropriate for your students
- **Which lessons are approved** for use in your schools

AGNI enforces these policies automatically. Lessons that don't meet your criteria are flagged as non-compliant.

---

## Getting Started

1. Open the portal in your browser and go to **Settings** to configure the hub connection.
2. You need a **creator account** to access governance tools. If you don't have one, ask your administrator to create one at **Admin** > **Accounts**.
3. Navigate to **Governance** from the home page. You'll be asked to log in with your creator credentials.

---

## Setting Policy

Go to **Governance** > **Policy** tab.

### UTU Targets

UTU is a 3D coordinate system for categorizing skills: **Spine** (subject area), **Band** (complexity level 1-6), and **Protocol** (teaching method P1-P5).

- Click **+ Add UTU target** to add a row.
- Pick a **Spine** (e.g. MAC-2 for mathematics, SCI-1 for science).
- Set the **Band** (1 = foundational, 6 = advanced).
- Pick a **Protocol** (or "Any" to allow all).

Example: To require that all math lessons cover Band 3-4 concepts using Guided Construction (P2), add: `MAC-2, Band 3, P2` and `MAC-2, Band 4, P2`.

### Teaching Modes

Check the teaching modes your district allows: socratic, didactic, guided_discovery, narrative, constructivist, direct. Unchecked modes will cause lessons using them to be flagged.

### Difficulty Bounds

Set the **minimum and maximum difficulty** (1-5 scale) appropriate for your student population.

### Requirements

- **Require UTU label**: lessons must declare their UTU coordinates to be approved.
- **Require teaching mode**: lessons must declare their teaching approach.

Click **Save Policy** when done.

---

## Managing the Approved Catalog

Go to **Governance** > **Catalog** tab.

The approved catalog is the list of lesson IDs that are permitted for use in your schools. Only approved lessons appear in student recommendations.

- **Add lessons**: select lessons from the available pool and add them to the catalog.
- **Remove lessons**: remove lessons that are no longer appropriate.

### Importing a catalog

Go to **Governance** > **Import** tab.

If another school or district has shared their approved catalog:

1. Upload or paste the catalog JSON file.
2. Choose a strategy: **Replace** (overwrite your catalog), **Merge** (add their lessons to yours), or **Add only** (add new lessons, don't remove any of yours).
3. Preview the changes.
4. Confirm.

### Exporting your catalog

On the **Policy** page, click **Export Policy** to download your policy as a JSON file. Share this with other hubs or districts so they can import your standards.

---

## Compliance Report

Go to **Governance** > **Report** tab.

The report shows:
- How many students are being tracked
- How many lessons are indexed
- How many skills are covered
- Which lessons are compliant vs non-compliant with your policy

Use this to audit your catalog and identify gaps in curriculum coverage.

---

## Sharing policy across hubs

AGNI is designed for **sovereign governance** — each hub (school, district) sets its own policy. But you can share policy by:

1. **Export** your policy JSON from one hub.
2. **Import** it on another hub.
3. Each hub can then customize further.

This is particularly useful when a district office sets baseline standards and individual schools layer their own preferences on top.

---

## What to read next

- [Teachers guide](TEACHERS.md) — how teachers use the hub day-to-day
- [UTU Architecture spec](../specs/utu-architecture.md) — full details on the Spine/Band/Protocol coordinate system
- [Governance playbook](../playbooks/governance.md) — for developers modifying the governance system
