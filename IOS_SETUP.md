# iOS Setup — Rapports de visite

This guide takes the **Rapports de visite** app from zero to a build running on
an iPhone via **TestFlight**. The app is a React + Vite web app wrapped as a
native iOS app with [Capacitor](https://capacitorjs.com/), built in the cloud by
[Codemagic](https://codemagic.io/) (no Mac required on your side).

The build pipeline is already defined in [`codemagic.yaml`](./codemagic.yaml).
The steps below are the accounts and configuration that only you can set up.

---

## 0. What you need before starting

| Requirement | Notes |
|-------------|-------|
| **Apple ID** | The one you'll use for the developer account. |
| **Apple Developer Program membership** | $99/year. Required for *any* iPhone install or TestFlight — there is no free path to distributing an iOS app. |
| **A credit card** | For the developer program fee. |
| **The Firebase config values** | The same `VITE_FIREBASE_*` values already used for the Android build (Firebase Console → Project settings → Your apps → Web app config). |
| A GitHub account with access to this repo | You already have this. |

You do **not** need a Mac. (If you *do* have one, see the [Appendix](#appendix--building-locally-on-a-mac) for a faster local loop.)

---

## 1. Enroll in the Apple Developer Program

1. Go to <https://developer.apple.com/programs/enroll/>.
2. Sign in with your Apple ID and complete enrollment as an **Individual** or
   **Organization**.
   - *Organization* requires a D-U-N-S number for EVOQ and shows the company as
     the seller; *Individual* shows your personal name. For an internal tool,
     Individual is faster; for anything customer-facing under the EVOQ name,
     choose Organization.
3. Enrollment approval can take anywhere from a few minutes to a couple of days.
   You cannot do the App Store Connect steps below until it's approved.

---

## 2. Register the app in App Store Connect

1. Go to <https://appstoreconnect.apple.com/> → **Apps** → **＋** → **New App**.
2. Fill in:
   - **Platform:** iOS
   - **Name:** `Rapports de visite`
   - **Primary language:** French
   - **Bundle ID:** `com.evoq.rapportsdevisite`
     — this must match `appId` in
     [`rapports-de-visite/capacitor.config.ts`](./rapports-de-visite/capacitor.config.ts).
     If the bundle ID isn't in the dropdown, create it first at
     [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
     (**＋** → App IDs → App → description "Rapports de visite", bundle ID
     `com.evoq.rapportsdevisite`, explicit).
   - **SKU:** anything unique, e.g. `rdv-001`.
3. Save. You don't need to fill in screenshots/description yet — TestFlight
   doesn't require them.

---

## 3. Create an App Store Connect API key

Codemagic uses this key to sign the build and upload it to TestFlight
automatically (the `codemagic.yaml` uses `auth: integration`).

1. In App Store Connect → **Users and Access** → **Integrations** tab →
   **App Store Connect API** → **＋**.
2. Give it a name (e.g. `codemagic`) and role **App Manager**.
3. **Download the `.p8` key file immediately** — you can only download it once.
4. Note these three values, you'll paste them into Codemagic:
   - **Issuer ID** (shown above the keys table)
   - **Key ID** (the row you just created)
   - the **`.p8` file** itself

---

## 4. Set up Codemagic

### 4a. Create the account and connect the repo

1. Go to <https://codemagic.io/> → **Sign up**, choosing **Sign in with GitHub**
   (simplest, since the repo is on GitHub).
2. Authorize Codemagic for the `ericsteinhk-droid/scribbleaway` repository.
3. Add the app: **Add application** → pick GitHub → select
   `ericsteinhk-droid/scribbleaway`.
4. When asked for build configuration, choose **"codemagic.yaml"** (not the
   Workflow Editor) — the pipeline is already committed at the repo root.

### 4b. Register the App Store Connect API key in Codemagic

1. Codemagic → **Teams** (or your personal account) → **Integrations** →
   **Apple Developer Portal / App Store Connect** → **Connect**.
2. Paste the **Issuer ID**, **Key ID**, and upload the **`.p8`** from step 3.
3. Name the integration. The `codemagic.yaml` references it generically via
   `app_store_connect: { auth: integration }`, so any correctly configured
   App Store Connect integration on the team will be used.

### 4c. Set up iOS code signing

The `codemagic.yaml` declares:

```yaml
environment:
  ios_signing:
    distribution_type: app_store
    bundle_identifier: com.evoq.rapportsdevisite
```

With the App Store Connect API key connected (step 4b), Codemagic can
**automatically manage signing** — it creates the distribution certificate and
provisioning profile for `com.evoq.rapportsdevisite` for you. In the app's
settings under **Distribution → iOS code signing**, choose **Automatic** if
prompted. No manual certificate juggling required.

### 4d. Add environment variables

The build writes a `.env` for Vite from these. In Codemagic → your app →
**Environment variables**, add each of the following (mark them **Secure**).
Assign them to a group and reference that group, or add them directly:

| Variable | Where to find it |
|----------|------------------|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project settings → Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |

> **Note on the AI features.** The Anthropic (reformat) and OpenAI (voice
> dictation → Whisper) keys are **not** baked into the iOS build. Users enter
> their own keys in the app's **Settings** screen at runtime, exactly as on
> Android. So you don't need `VITE_ANTHROPIC_API_KEY` / `VITE_OPENAI_API_KEY`
> in Codemagic unless you later decide to ship an org-wide key.

---

## 5. Run the build

1. In Codemagic → your app → **Start new build**.
2. **Branch:** `claude/scribbleaeay-ios-app-agu9fe` (or whichever branch holds
   the iOS work you want to ship).
3. **Workflow:** `Rapports de visite — iOS` (id `ios-rapports-de-visite`).
4. Start it. A successful run:
   - installs npm deps and builds the web assets,
   - runs `npx cap add ios` + `npx cap sync ios`,
   - patches `Info.plist` with the camera / **microphone** / photo-library
     permission strings,
   - builds and signs the `.ipa`,
   - uploads it to **TestFlight**.
5. On success/failure, an email goes to the address in `codemagic.yaml`
   (currently `estein@evoqarchitecture.com` — change it there if you want a
   different recipient). The `.ipa` is also downloadable from the Codemagic
   build page.

First builds take ~10–20 min. Expect to iterate once or twice on signing/env
config — that's normal.

---

## 6. Test on your iPhone via TestFlight

1. Install **TestFlight** from the App Store on your iPhone.
2. In App Store Connect → your app → **TestFlight**, the build appears after
   Apple finishes processing it (a few minutes to ~an hour the first time).
3. Apple asks for **export compliance** on new builds. The build already
   declares `ITSAppUsesNonExemptEncryption = false` in `Info.plist`, so this
   should be answered automatically. If asked anyway, answer **No** (the app
   uses only standard HTTPS).
4. Add yourself as an **Internal Tester** (Users and Access → your Apple ID with
   a role, then add to the internal testing group). Internal testers get builds
   immediately with no Apple review.
5. Open TestFlight on the phone → install → run. Verify in particular:
   - **Camera** and **Gallery** photo capture,
   - **Voice dictation** (the mic-permission fix),
   - **Photo annotation**,
   - **Export/share** of DOCX / PDF / ZIP via the iOS share sheet.

> External testers (people outside your team) require a one-time Apple **Beta
> App Review**, which takes a day or so. Internal testers do not.

---

## 7. Later: public App Store release

When you're ready to ship publicly, in `codemagic.yaml` flip:

```yaml
publishing:
  app_store_connect:
    submit_to_app_store: false   # → true
```

and fill in the App Store listing (screenshots, description, privacy details) in
App Store Connect. That triggers full Apple App Review.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Build fails at signing | App Store Connect API key not connected in Codemagic, or the bundle ID `com.evoq.rapportsdevisite` isn't registered (step 2). |
| App crashes when tapping **Dicter** (dictate) | Missing `NSMicrophoneUsageDescription`. Already added by the `codemagic.yaml` plist patch — confirm that step ran in the build log. |
| Login / data doesn't work in the build | `VITE_FIREBASE_*` env vars missing or wrong in Codemagic (step 4d). Check the "Write .env" step in the build log. |
| Blank screen on launch | Usually a web build error — check the "Build web assets" step; also confirm Firebase auth domain is authorized for the app. |
| TestFlight build stuck "Processing" | Normal for the first build; can take up to ~an hour. |
| Export-compliance prompt every build | Confirm `ITSAppUsesNonExemptEncryption` is present in the plist-patch step of `codemagic.yaml`. |

---

## Appendix — building locally on a Mac

If you have access to a Mac with Xcode, you can build without Codemagic:

```bash
cd rapports-de-visite
cp .env.example .env        # fill in the VITE_FIREBASE_* values
npm install
npm run build
npx cap add ios             # first time only
npx cap sync ios
npx cap open ios            # opens the project in Xcode
```

Then in Xcode: select your team under **Signing & Capabilities**, pick your
device, and press **Run**. Note that a local `cap add ios` won't apply the
`Info.plist` permission patches from `codemagic.yaml` automatically — add the
`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
`NSPhotoLibraryUsageDescription`, and `NSPhotoLibraryAddUsageDescription` keys
in Xcode's Info tab yourself (the `ios/` folder is gitignored and rebuilt each
time).
