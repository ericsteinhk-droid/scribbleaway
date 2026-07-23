# Repository guide for Claude

This repo hosts several EVOQ tools. The primary app under active development is
**Rapports de visite** (site-visit reports), in [`rapports-de-visite/`](./rapports-de-visite/).

## ⚠️ Cross-platform parity is a hard requirement

**Every feature change to Rapports de visite MUST land on both the iOS app and
the Android APK.** Never ship a feature to one platform only.

This is mostly automatic, because of how the app is built — but there are exact
spots where the platforms diverge, and those must be kept in sync by hand.

### How the app is built

Rapports de visite is a **single React + Vite + TypeScript codebase** in
`rapports-de-visite/`, wrapped as a native app with **Capacitor**. There is one
shared source; the two platforms are just native shells around it:

- **Android APK** — built by [`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml) (Capacitor Android + Gradle, on GitHub Actions).
- **iOS IPA** — built by [`codemagic.yaml`](./codemagic.yaml) (Capacitor iOS + Xcode, on Codemagic → TestFlight). Setup: [`IOS_SETUP.md`](./IOS_SETUP.md).

Because the UI/logic lives in shared code (`rapports-de-visite/src/**`), a
feature written there appears on **both** platforms automatically. Prefer the
cross-platform Capacitor APIs (`@capacitor/*`) and branch on
`Capacitor.isNativePlatform()` / `Capacitor.getPlatform()` when behavior must
differ — never fork the feature into platform-only screens.

### The three things that DON'T sync automatically — check every time

When a change touches any of these, update **both** platforms in the same PR:

1. **Device capabilities / permissions.** A new plugin or permission must be
   declared on both:
   - **Android:** `build-apk.yml` — the "Patch AndroidManifest" step (and
     `MainActivity` patch if the WebView needs a runtime grant, e.g. mic).
   - **iOS:** `codemagic.yaml` — the "Patch Info.plist" step (the `NS*UsageDescription` keys).

   Current permission set (keep these mirrored): camera, microphone (voice
   dictation), photo library / gallery, internet.

2. **Capacitor plugins.** Adding an `@capacitor/*` plugin to `package.json`
   affects both platforms; verify the corresponding native permission exists in
   *both* build files above.

3. **The source-of-truth branch.** Both pipelines build from **one** branch so
   the APK and IPA are compiled from identical source:

   > **Source of truth: `claude/scribbleaeay-ios-app-agu9fe`**

   `build-apk.yml` (`ref:` + push trigger) and the branch you build in Codemagic
   for `codemagic.yaml` must both point here. If the source-of-truth branch ever
   changes, update `build-apk.yml` and this file together.

### Before finishing any Rapports de visite change

- [ ] Feature logic is in shared `rapports-de-visite/src/**` (not platform-forked).
- [ ] If a new permission/plugin was added: both `build-apk.yml` **and** `codemagic.yaml` updated.
- [ ] `cd rapports-de-visite && npm run build` passes (this runs `tsc` + Vite).
- [ ] Work committed to the single source-of-truth branch above.

## Other tools in this repo (not the mobile app)

- `word_search.py` / `file_search.py`, `contact_sheet_builder.py` — Python
  desktop utilities packaged as Windows `.exe` via `build-exe.yml` /
  `build-contact-sheet.yml`.
- `rgo-analyzer/` — a separate Electron/Vite app.

These are independent of the iOS/Android parity rule above.
