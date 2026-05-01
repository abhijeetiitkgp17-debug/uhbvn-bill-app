# Bill Splitter — Android App

A native Android app to split your UHBVN electricity bill with your tenant.
Runs entirely on your phone. No backend, no accounts, no data sent anywhere.

## Features

- **Three ways to enter the bill**: Upload PDF (auto-parses), photo of bill (OCR), or manual entry
- **Photo-scan submeter readings**: Point camera at meter, app reads the digits
- **Auto-fill previous reading**: Last month's "current" becomes this month's "previous"
- **WhatsApp share**: One-tap send for you and your tenant
- **Local history**: All past months saved on-device, exportable to CSV
- **Settings**: Names, phone numbers, meter labels — all stored privately

## Files in this project

```
bill-splitter-android/
├── src/
│   ├── index.html         ← UI shell with all screens
│   ├── styles.css         ← All styling
│   ├── app.js             ← Main app logic
│   ├── parser.js          ← UHBVN bill PDF parser
│   ├── ocr.js             ← Camera + ML Kit text recognition
│   └── db.js              ← Local storage (Capacitor Preferences)
├── .github/
│   └── workflows/
│       └── build.yml      ← GitHub Actions auto-build
├── package.json           ← Capacitor + plugin dependencies
├── capacitor.config.json  ← App ID, name, web dir
├── .gitignore
└── README.md
```

---

## Path A: Build with GitHub Actions (recommended — zero local setup)

You don't need Android Studio, Node.js, or anything installed on your computer.
GitHub builds the APK for you in the cloud.

### Step 1: Create the GitHub repository

1. Go to https://github.com/new
2. Name: `bill-splitter` (or whatever you prefer)
3. Set to **Public** (private works too if you have GitHub Pro)
4. Click **Create repository**

### Step 2: Upload the project files

**Easy way (web upload)**:
1. On the new empty repo, click **uploading an existing file** link
2. Drag and drop ALL the contents of this `bill-splitter-android` folder
3. Make sure you upload:
   - The `src/` folder (with all 6 files inside)
   - The `.github/` folder (with workflows/build.yml)
   - `package.json`
   - `capacitor.config.json`
   - `.gitignore`
   - `README.md`
4. Scroll down → **Commit changes**

> ⚠️ Important: GitHub web upload sometimes skips folders with dots like `.github`. If you don't see it after upload, you'll need to use the git command line OR create the file manually:
> 1. Click **Add file → Create new file**
> 2. Name it: `.github/workflows/build.yml` (typing the slashes creates folders)
> 3. Paste the contents from `build.yml` in this project
> 4. Commit

### Step 3: Wait for the build

1. After committing, click the **Actions** tab at the top of your repo
2. You'll see a workflow run starting (yellow dot)
3. Wait ~5–8 minutes for it to complete (green checkmark)
4. If it fails (red X), click into it to see the error

### Step 4: Download the APK

1. Click on the completed workflow run
2. Scroll to the bottom — under **Artifacts**, click **bill-splitter-apk**
3. A zip downloads. Extract it to get `bill-splitter-debug.apk`

### Step 5: Install on your Android phone

1. Transfer the APK to your phone (email it to yourself, Google Drive, or USB)
2. On your phone, tap the APK file to install
3. Android will warn "Install unknown apps" — go to Settings, allow it for your file manager (one-time)
4. Tap install — done! The "Bill Splitter" app appears in your launcher

### Step 6: First-run setup

1. Open the app
2. Go to **Settings**
3. Enter your name and WhatsApp number (e.g. `919876543210`)
4. Save
5. Done — you're ready to use it monthly

---

## Path B: Build locally (if you want to tinker)

Requires:
- Node.js 18+ (https://nodejs.org)
- Android Studio with Android SDK (https://developer.android.com/studio)
- Java 17

### Steps:

```bash
cd bill-splitter-android
npm install
npx cap add android
npx cap sync android
npx cap open android      # opens Android Studio
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## How to use the app

### Monthly flow

1. Open app → **New bill split**
2. **Bill data** — pick one tab:
   - **PDF**: tap dropzone, choose UHBVN bill PDF from your downloads (auto-extracts amount + units)
   - **Photo**: tap "Take photo of bill", point camera at paper bill (OCR extracts text)
   - **Manual**: type the amount and units yourself
3. **Verify** — confirmation card shows extracted values, edit if OCR misread anything
4. **Submeter readings**:
   - **Previous reading**: auto-filled from last month (or type it manually)
   - **Current reading**: type it OR tap 📸 to scan from meter photo
5. Tap **Calculate tenant's share**
6. **Results** appear with full breakdown
7. Tap green WhatsApp buttons → opens WhatsApp with message ready → send
8. Tap **💾 Save to history**

### History

- Tap **History** on home screen
- See all saved bills, sorted newest first
- Tap any entry to view full details + re-send via WhatsApp
- Tap **⤓ CSV** at the top to export everything as a spreadsheet
- Tap 🗑 inside an entry to delete it

### Updating the app

When I make code changes:

1. Replace the affected files in your GitHub repo (web upload edit)
2. Commit
3. GitHub Actions auto-rebuilds the APK
4. Download the new APK, install over the existing app (Android keeps your data)

---

## Troubleshooting

**"App not installed" on phone**
- You're trying to install over an older version with a different signing key. Uninstall the old one first.

**Camera doesn't open**
- Settings → Apps → Bill Splitter → Permissions → enable Camera

**OCR reads wrong number**
- Make sure the meter display is clean, well-lit, in focus
- The app shows OCR'd value in the "Current reading" field — you can always edit it before calculating
- Bright direct sunlight on glass meter covers causes glare — try a slight angle

**WhatsApp button does nothing**
- Make sure WhatsApp is installed
- The app uses `wa.me` links which open WhatsApp directly

**"Could not find amount or units in PDF"**
- The PDF might be a scanned/image PDF (no text data)
- Try the Photo tab instead, or download a fresh digital PDF from UHBVN portal
- Or use Manual tab as a fallback (always works)

**Build fails on GitHub Actions**
- Click the failed run → see logs
- Most common: missing files. Make sure `.github/workflows/build.yml` is present in the repo

---

## Privacy

All data stays on your phone:
- Bill PDFs are processed locally (never uploaded)
- OCR runs on-device using Google ML Kit (no internet needed)
- History saved to phone's local storage
- Settings (numbers, names) saved to phone's local storage
- WhatsApp messages opened via standard `wa.me` link — same as if you typed them yourself

The only network calls the app makes:
- Loading Google Fonts (cosmetic, can be removed)
- Loading PDF.js library from CDN
Both happen once when the app first opens, after which it works offline.

---

## License & support

This is a personal project. Modify freely.
If something breaks, look at the browser console (when running on web) or use Chrome's `chrome://inspect` for the connected Android device.
