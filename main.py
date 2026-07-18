import os
import sys
import json
import zipfile
import datetime
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/drive.file']
TOKEN_FILE = 'token.json'
CREDENTIALS_FILE = 'credentials.json'
CONFIG_FILE = 'folders.json'
# folder created on Drive to hold all backups
DRIVE_BACKUP_FOLDER_NAME = 'PythonBackups'

# Config (marked folders)


def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {"folders": []}


def save_config(config: dict):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)


def add_folder(config: dict, path: str):
    path = str(Path(path).resolve())
    if not os.path.isdir(path):
        print(f"  Not a valid folder: {path}")
        return
    if path in config["folders"]:
        print("  Already marked for backup.")
        return
    config["folders"].append(path)
    save_config(config)
    print(f"  Added: {path}")


def remove_folder(config: dict, index: int):
    try:
        removed = config["folders"].pop(index)
        save_config(config)
        print(f"  Removed: {removed}")
    except IndexError:
        print("  Invalid selection.")


def list_folders(config: dict):
    if not config["folders"]:
        print("  No folders marked yet.")
        return
    for i, f in enumerate(config["folders"]):
        exists = "OK" if os.path.isdir(f) else "MISSING"
        print(f"  [{i}] ({exists}) {f}")


# Google Drive Auth

def authenticate(force_reauth: bool = False):
    """Authenticate and return a Drive API service object, or None on failure."""
    creds = None

    if force_reauth and os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)

    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None

        if not creds:
            if not os.path.exists(CREDENTIALS_FILE):
                print(
                    f"  Missing '{CREDENTIALS_FILE}'. Place your OAuth credentials file here first.")
                return None
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())

    try:
        service = build('drive', 'v3', credentials=creds)
        # quick sanity check call
        service.files().list(pageSize=1, fields="files(id)").execute()
        return service
    except HttpError:
        return None
    except Exception:
        return None


def ensure_drive_connection():
    """Checks Drive connection at startup. Offers re-auth if it fails."""
    print("Checking Google Drive connection...")
    service = authenticate()
    if service:
        print("  Connected.\n")
        return service

    print("  Could not connect to Google Drive.")
    choice = input("  Re-authorize now? (y/n): ").strip().lower()
    if choice == 'y':
        service = authenticate(force_reauth=True)
        if service:
            print("  Reconnected successfully.\n")
            return service
        else:
            print(
                "  Still could not connect. Check your credentials.json and internet connection.")
    return service  # may be None


# Zip + Upload

def zip_folder(folder_path: str, output_dir: str = '.') -> str:
    folder_path = Path(folder_path).resolve()
    # stable name -> enables "replace" on Drive
    zip_name = f"{folder_path.name}_backup.zip"
    zip_path = Path(output_dir) / zip_name

    print(f"  Zipping '{folder_path}' -> '{zip_path}'")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(folder_path):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(folder_path.parent)
                zf.write(file_path, arcname)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"  Done ({size_mb:.2f} MB)")
    return str(zip_path)


def get_or_create_drive_folder(service, folder_name: str) -> str:
    query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
    results = service.files().list(q=query, fields='files(id, name)').execute()
    folders = results.get('files', [])
    if folders:
        return folders[0]['id']
    metadata = {'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'}
    folder = service.files().create(body=metadata, fields='id').execute()
    return folder.get('id')


def find_existing_file(service, filename: str, parent_id: str):
    query = f"name='{filename}' and '{parent_id}' in parents and trashed=false"
    results = service.files().list(q=query, fields='files(id, name)').execute()
    files = results.get('files', [])
    return files[0]['id'] if files else None


def upload_or_replace(service, file_path: str, parent_id: str):
    filename = Path(file_path).name
    media = MediaFileUpload(file_path, resumable=True)
    existing_id = find_existing_file(service, filename, parent_id)

    if existing_id:
        print(f"  Existing backup found on Drive. Replacing '{filename}'...")
        request = service.files().update(fileId=existing_id, media_body=media)
    else:
        print(f"  Uploading new backup '{filename}'...")
        metadata = {'name': filename, 'parents': [parent_id]}
        request = service.files().create(body=metadata, media_body=media, fields='id')

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"    Progress: {int(status.progress() * 100)}%")

    print(f"  Upload complete: {filename}")


def backup_all(service, config: dict):
    if not config["folders"]:
        print("  No folders marked for backup. Add some first.")
        return

    drive_folder_id = get_or_create_drive_folder(
        service, DRIVE_BACKUP_FOLDER_NAME)

    for folder in config["folders"]:
        if not os.path.isdir(folder):
            print(f"  Skipping (missing): {folder}")
            continue
        print(f"\nBacking up: {folder}")
        zip_path = zip_folder(folder)
        upload_or_replace(service, zip_path, drive_folder_id)
        os.remove(zip_path)  # local zip is temporary; Drive is source of truth

    print("\nAll backups complete!")


# Menu

def print_menu():
    print("\n=== Folder Backup Menu ===")
    print("1. List marked folders")
    print("2. Add a folder")
    print("3. Remove a folder")
    print("4. Back up all now")
    print("5. Re-check Drive connection")
    print("6. Exit")


def main():
    print("=== Google Drive Folder Backup ===\n")
    config = load_config()
    service = ensure_drive_connection()

    while True:
        print_menu()
        choice = input("Select an option: ").strip()

        if choice == '1':
            list_folders(config)

        elif choice == '2':
            path = input("  Folder path to add: ").strip().strip('"')
            add_folder(config, path)

        elif choice == '3':
            list_folders(config)
            idx = input("  Index to remove: ").strip()
            if idx.isdigit():
                remove_folder(config, int(idx))

        elif choice == '4':
            if not service:
                print("  Not connected to Drive. Use option 5 first.")
                continue
            backup_all(service, config)

        elif choice == '5':
            service = ensure_drive_connection()

        elif choice == '6':
            print("Goodbye.")
            sys.exit(0)

        else:
            print("  Invalid option.")


if __name__ == '__main__':
    main()
