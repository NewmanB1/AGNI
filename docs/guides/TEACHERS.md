# Guide: Teachers

How to use AGNI to manage your classroom, monitor student progress, and assign lessons.

---

## Getting Started

1. **Open the portal** in your browser (your administrator will give you the URL — typically `http://<hub-ip>:8082/`).
2. **Configure the hub connection**: Go to **Settings** and enter the hub URL. Click **Test Connection**, then **Save**.
3. Return to the home page and click **Teacher Hub**.

---

## The Teacher Hub

The hub is your main dashboard. It shows all students at a glance.

### What you see

- **Summary cards** at the top: total students, how many are on track (green), moderate (yellow), or struggling (red), and the average mastery percentage.
- **Group selector** dropdown: filter by student group, or view all students.
- **Student cards**: each card shows the student's name, mastery progress bar, their next recommended lesson, and a color-coded status dot.

### Monitoring progress

- **Green dot**: student is progressing well (mastery above threshold).
- **Yellow dot**: student is moderate — may need attention.
- **Red dot**: student is struggling — consider assigning easier material or checking in personally.

Click **Details** on any student card to see their full skill breakdown, mastery per topic, and lesson history.

### Overriding lesson recommendations

AGNI automatically recommends the next best lesson for each student using adaptive ordering (theta). Sometimes you know better — a student needs to revisit a topic, or the whole class should do the same lesson together.

**For one student:**
1. Click **Override** on their card.
2. Pick a lesson from the dropdown (shows title, difficulty, and current mastery).
3. Click **Apply**. The student's next lesson is now your choice, not theta's.
4. To revert, click **Override** again and select **Clear override**.

**For multiple students (batch):**
1. Check the boxes on several student cards (or click **Select All**).
2. A batch control bar appears with a lesson dropdown showing lessons that are common across the selected students.
3. Pick a lesson and click **Batch Override**.

---

## Student Groups

Navigate to **Student Groups** from the home page.

- **Create a group**: click **+ Create group**, name it (e.g. "Reading Circle A"), check off the students, and save.
- **Edit a group**: click **Edit** to add or remove students.
- **Assign a lesson to a group**: click **Assign lesson** to push a specific lesson to all students in the group. This uses the override system — theta ordering resumes once the override is cleared.

Groups help you differentiate instruction. Create groups by ability level, topic interest, or any classroom need.

---

## Managing Student Accounts

Go to **Admin** > **Accounts** > **Students** tab.

- **Bulk create students**: paste a list of names (one per line), optionally set a shared PIN, and click **Create Students**. Copy or print the generated pseudo-IDs.
- **Edit a student**: click **Edit** to change their display name or PIN.
- **Transfer to a new device**: if a student gets a new phone, click **Transfer** to generate a one-time code. The student enters this code on their new device to restore their progress.
- **Deactivate**: disable a student account (e.g. after graduation) without deleting their data.

---

## Generating Parent Invite Codes

To let a parent view their child's progress:

1. Use the API to generate an invite: `POST /api/parent/invite` with the student's pseudo-ID. (A portal UI for this is planned but not yet available.)
2. Share the 6-character code with the parent (on paper, via message, etc.).
3. The parent enters the code on the **Parent Dashboard** to link to their child.

Invite codes expire after 7 days and are single-use.

---

## Tips

- **Check the hub daily** — the summary cards tell you immediately if anyone is falling behind.
- **Use groups for differentiation** — don't fight the adaptive ordering for every student; group overrides are more efficient.
- **Let theta work** — the default recommendations are usually good. Override only when you have a specific pedagogical reason.
- **Nicknames**: click a student's pseudo-ID on their card to assign a friendly name. Only you see it; students see their own display name.

---

## What to read next

- [Settings & first-run setup](FIELD-TECH.md) — if you're also the person setting up the hub
- [Lesson Creators guide](LESSON-CREATORS.md) — if you want to write your own lessons
- [Parents guide](PARENTS.md) — share this with parents so they know how to check progress
