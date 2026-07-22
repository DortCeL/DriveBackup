# DriveBackup - A Lightweight Automation System For Your Backup

A lightweight Python console application for backing up selected local folders to Google Drive. Each marked folder is compressed into a zip archive and uploaded (or updated in place) on the user's own Google Drive account using the Google Drive API.

## Features

- Mark any number of local folders for backup; selections persist between runs
- Verifies the Google Drive connection on startup and prompts for re-authorization if the session has expired or been revoked
- Compresses folders into zip archives before upload
- Replaces the existing backup on Drive instead of creating duplicates on each run
- All backups are stored in a single, dedicated folder on Google Drive
- Simple menu-driven console interface, no external configuration required beyond Google API credentials

## Requirements

- Python 3.8 or later
- A Google account with access to Google Drive
- A Google Cloud project with the Drive API enabled and OAuth credentials configured

## Installation

1. Clone or download this repository.
2. Install the required dependencies:

   ```bash
   pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client
   ```

3. Set up Google Drive API credentials:
   - Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the **Google Drive API**
   - Configure the OAuth consent screen (External user type, with your account added as a test user)
   - Create an **OAuth client ID** of type **Desktop app**
   - Download the resulting JSON file and save it as `credentials.json` in the project's root directory

## Usage

Run the application from the project directory:

```bash
python backup_app.py
```

On first launch, a browser window will open asking you to sign in and authorize access to your Google Drive. This creates a local `token.json` file so future runs do not require repeated sign-in.

### Menu options

| Option | Description                                          |
| ------ | ---------------------------------------------------- |
| 1      | List all folders currently marked for backup         |
| 2      | Add a new folder to the backup list                  |
| 3      | Remove a folder from the backup list                 |
| 4      | Back up all marked folders now                       |
| 5      | Re-check or re-authorize the Google Drive connection |
| 6      | Exit the application                                 |

## Configuration Files

The application creates and manages the following files in its working directory. These files are specific to the local machine and Google account and should not be shared or committed to version control.

| File               | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `credentials.json` | OAuth client credentials downloaded from Google Cloud Console         |
| `token.json`       | Stored authorization token generated after the first successful login |
| `folders.json`     | List of local folder paths marked for backup                          |

## How Backups Work

1. Each marked folder is compressed into a zip archive named after the folder (e.g., `Documents_backup.zip`).
2. The application checks whether a file with the same name already exists in the designated Google Drive backup folder.
3. If found, the existing file is updated in place; otherwise, a new file is created.
4. The local zip archive is removed after a successful upload, as Google Drive serves as the source of truth for backups.

## Project Status

This is currently a console-only application, intended as a functional first version. It is being developed incrementally, with a graphical interface planned for a future release.

## Planned Improvements

- **Graphical user interface** to replace the console-based menu with a more accessible desktop application
- **Folder name collision handling**, such as including a path-based identifier in the zip filename to avoid conflicts between folders that share the same name
- **Scheduled backups** using a background scheduler or OS-level task scheduling (e.g., cron, Task Scheduler)
- **Exclusion rules** to skip specified files or directories (e.g., `.git`, `node_modules`, cache folders) during zipping
- **Backup history and versioning**, allowing multiple dated backups to be retained rather than always replacing the latest version
- **Progress and error logging** to a persistent log file for easier troubleshooting
- **Multi-account support** for backing up to more than one Google Drive account
- **Compression options**, such as configurable compression levels or alternative archive formats
- **Backup verification**, confirming uploaded archive integrity against the local file before deletion

## Security Notes

- `credentials.json` and `token.json` grant access to the associated Google Drive account and should be kept private.
- Add both files to `.gitignore` if the project is tracked with version control.
- The application requests the `drive.file` scope, which limits access to files created by the application itself rather than the user's entire Drive.
