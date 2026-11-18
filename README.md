# Android Batch File Transfer

A desktop application for copying a local folder to one or more Android devices over ADB. The application window and Windows installer use the name **File Burner**.

Built with Electron, JavaScript, HTML, and CSS. The current packaging configuration targets Windows x64.

## Features

- Detect connected and authorized Android devices.
- Select a local source folder and a destination on the device.
- Copy to multiple devices concurrently, with a progress indicator for each device.
- Preserve the relative paths of copied files.
- Save friendly device names locally.
- Switch between light and dark themes and view an activity log.

## Requirements

- Windows for the configured installer target.
- Node.js and npm compatible with the dependencies in `package-lock.json`.
- Android SDK Platform-Tools installed separately, with `adb.exe` available on your `PATH`.
- Android devices connected with data-capable USB cables, USB debugging enabled, and the computer authorized on each device.

The application runs ADB from `PATH`; placing Platform-Tools next to the source alone does not configure it.

## Run from source

```powershell
git clone https://github.com/de2004de/android-batch-transfer.git
cd android-batch-transfer
npm ci
adb version
adb devices -l
npm start
```

The existing dependency list includes the native `node-mtp` package. If installation reports a native build failure, resolve its build prerequisites before running the app. The current Electron main process performs transfers by launching ADB directly.

## Copy a folder

1. Connect and authorize the Android device, then click **Refresh**.
2. Select one device to load its destination folders.
3. Choose a destination and click **Pick Source Folder** to select the local folder.
4. To copy to several devices, enable **Multi-select** and select the additional devices. The chosen destination name is used for each device.
5. Click **Start Copy** and watch the per-device progress and activity log.

The source folder's contents are copied into the selected destination. Destination names are normalized to letters, digits, dots, underscores, and hyphens. The app tries common writable Android storage roots. Existing files with matching paths may be overwritten. Progress updates after each file completes, so a large file can leave the progress indicator unchanged for a while.

## Build a Windows installer

```powershell
npm run build
```

Electron Builder is configured to create an NSIS x64 installer in `dist/`, using `assets/file-transfer.ico` and the existing `license.md` installer text. ADB must also be installed and available on the target computer's `PATH`.

## Project layout

| Path | Purpose |
| --- | --- |
| `electron/main.js` | Application window, device discovery, and ADB transfers |
| `electron/preload.js` | Interface between the UI and Electron main process |
| `electron/ps/` | Legacy PowerShell/MTP helpers, not invoked by the current main process |
| `ui/` | Interface markup, styles, and interaction logic |
| `package.json` | Dependencies, commands, and installer configuration |
| `package-lock.json` | Locked dependency versions |

Installed dependencies, generated installers, local assistant settings, and downloaded Platform-Tools are excluded from version control.

## Status

This is a source snapshot of the existing project. JavaScript syntax and PowerShell parsing were checked during upload preparation. A fresh dependency installation, installer build, and transfers to physical devices have not been verified as part of this upload.

## License

No open-source license has been selected. The existing `license.md` is placeholder installer text, not a software license.
