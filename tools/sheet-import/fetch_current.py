"""Download the live Google Sheet as .xlsx (named current_YYYY-MM-DD_HH-MM.xlsx, Brasília time).

Usage: python fetch_current.py SERVICE_ACCOUNT_KEY.json SPREADSHEET_ID OUT_DIR

The service account needs Viewer access to the sheet and the Drive API enabled.
"""
import datetime
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

BRT = datetime.timezone(datetime.timedelta(hours=-3))
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def main(key, file_id, out_dir):
    creds = service_account.Credentials.from_service_account_file(
        key, scopes=['https://www.googleapis.com/auth/drive.readonly'])
    drive = build('drive', 'v3', credentials=creds, cache_discovery=False)
    modified = drive.files().get(fileId=file_id, fields='modifiedTime').execute()['modifiedTime']
    when = datetime.datetime.fromisoformat(modified.replace('Z', '+00:00')).astimezone(BRT)
    path = os.path.join(out_dir, f'current_{when:%Y-%m-%d_%H-%M}.xlsx')
    with open(path, 'wb') as f:
        f.write(drive.files().export(fileId=file_id, mimeType=XLSX).execute())
    print(path)


if __name__ == '__main__':
    main(*sys.argv[1:4])
