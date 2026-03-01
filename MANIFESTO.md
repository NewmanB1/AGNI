# The AGNI Manifesto

## Education Should Not Require a Good Internet Connection

There are 260 million children out of school. Millions more attend schools with no
electricity, no internet, and no textbooks. The devices they *do* have — old
Android phones shared among families — are more powerful than the computers
that sent humans to the moon.

We are wasting that power.

---

## What AGNI Is

AGNI compiles YAML lessons into tiny, offline-first HTML bundles that run on
10-year-old phones and use built-in sensors (accelerometer, gyroscope, ambient
light) for interactive, hands-on learning.

A single lesson file is smaller than a photo. It works without internet. It
works without app stores. It works on devices that cost $20 used.

---

## What We Believe

**1. The phone is the lab.**
Every phone has an accelerometer. That makes it a physics instrument. Every
phone has a light sensor. That makes it a biology tool. We should teach
science *with* the device, not just *on* it.

**2. Offline is the default, not the fallback.**
In the places that need this most, connectivity is measured in minutes per
week. Everything must work without a network. Syncing is a bonus, not a
requirement.

**3. Content is code.**
Lessons are YAML files — human-readable, version-controlled, forkable,
translatable. A teacher in Nairobi can fork a physics lesson, translate it
to Swahili, and share it on a USB drive. No platform lock-in. No app store
approval. No vendor.

**4. Governance belongs to educators.**
Schools and districts set their own policies: what lessons are approved,
what standards must be met, what progression students follow. AGNI provides
the tools; educators make the decisions.

**5. Old devices are not broken devices.**
If a phone can run a browser, it can run AGNI. We target Android 6 WebView,
ES5 JavaScript, and localStorage. No frameworks. No build steps in the
runtime. Every byte earns its place.

**6. Designed for sunlight, dust, and cracked screens.**
Our UI uses high-contrast colors on warm paper backgrounds, large touch
targets, system fonts, and no decorative animations. If you can't read it
in direct sunlight with a scratched screen, it's a bug.

---

## How It Works

```
teacher writes lesson.yaml
        │
        ▼
   AGNI compiler
        │
        ▼
  single HTML file (~50KB)
        │
        ├──▶ village hub (Raspberry Pi, old laptop)
        │       ├──▶ WiFi to student phones
        │       └──▶ USB sneakernet
        │
        └──▶ direct share (WhatsApp, Bluetooth, SD card)
                └──▶ student opens in phone browser
```

No internet needed. No app install. No login. Open and learn.

---

## Join Us

- **Write a lesson**: Copy `lessons/gravity.yaml`, edit, validate, share.
- **Translate a lesson**: Fork → change `language: "sw"` → translate content → done.
- **Test on old phones**: Load compiled lessons, report what breaks.
- **Improve the engine**: See `CONTRIBUTING.md` and `ARCHITECTURE.md`.

Every child with a phone deserves a lab, a library, and a teacher who speaks
their language. AGNI is our attempt to build that.

---

*"The best tool is the one you already have."*
