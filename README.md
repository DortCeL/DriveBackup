# DriveBackup
<<<<<<< HEAD

A clean Electron desktop app that backs up selected folders to your Google Drive — automatically on a daily schedule or manually on demand.

---

## Features

- 📁 **Multi-folder backup** — select any number of folders to watch
- ☁️ **Google Drive upload** — files are zipped and organized under `DriveBackup/` in your Drive
- ⏰ **Daily schedule** — set a time for automatic backups while the app is running
- 📋 **Backup history** — full log of every backup run with status and file sizes
- 🔐 **Your own credentials** — your data goes directly to your personal Google Drive, never through a third-party server

---

## Prerequisites

- **Node.js** v18 or later → https://nodejs.org
- **Google Cloud account** (free) → https://console.cloud.google.com

---

## Installation

```bash
# 1. Clone or download this project
cd drivebackup

# 2. Install dependencies
npm install

# 3. Start the app
npm start
```

---

## Google OAuth Setup (one-time, ~5 minutes)

You need to create a free Google Cloud project to get OAuth credentials. DriveBackup uses **your own credentials** so your files go directly to your personal Google Drive.

### Step-by-step:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (name it anything, e.g. `DriveBackup`).

2. In the left menu go to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.

3. Go to **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Fill in App name (e.g. `DriveBackup`) and your email
   - Under **Test users**, add your Gmail address
   - Save

4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Name it anything
   - Under **Authorized redirect URIs**, add: `http://localhost:42813/oauth2callback`
   - Click **Create**

5. Copy the **Client ID** and **Client Secret**.

6. In DriveBackup → **Settings** tab, paste your Client ID and Client Secret and click **Save credentials**.

7. Click **Connect Google Account** — your browser will open for Google sign-in.

That's it! Your credentials are stored locally on your machine only.

---

## Building for Windows (.exe)

```bash
npm run build
```

The installer will be in the `dist/` folder as a `.exe` NSIS installer.

---

## Project Structure

```
drivebackup/
├── src/
│   ├── main/
│   │   ├── main.js       ← Electron main process, OAuth, backup logic
│   │   └── preload.js    ← Secure IPC bridge
│   ├── renderer/
│   │   ├── index.html    ← App UI
│   │   └── renderer.js   ← UI logic
│   └── assets/
│       └── icon.png      ← App icon (replace with your own)
├── package.json
└── README.md
```

---

## How backups work

1. Each selected folder is zipped using `archiver`
2. The zip is uploaded to Google Drive under `DriveBackup/<folder-name>/<folder-name>_<timestamp>.zip`
3. The zip is saved as: `FolderName_2025-01-15T02-00-00.zip`
4. Old backups are **not** automatically deleted — manage them from Google Drive directly

---

## Notes

- The app must be **open and running** for scheduled backups to trigger
- For true background scheduling on Windows, add a Task Scheduler entry to launch DriveBackup at startup
- Storage counts against your Google Drive quota (15 GB free)
- API calls are free within Google's standard limits
=======
Backs your necessary files on google drive
>>>>>>> 6bae5efced78aaa5f914e00726a60217f2008d3a
