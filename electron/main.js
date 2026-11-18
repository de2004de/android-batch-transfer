const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    icon: path.join(__dirname, "../assets/file-transfer.ico"),
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.loadFile(path.join(__dirname, "../ui/index.html"));
  //win.webContents.openDevTools();

}

app.whenReady().then(createWindow);

ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

function getAdbExecutable() {
  return process.platform === "win32" ? "adb.exe" : "adb";
}

function getCommonDeviceStorageRoots() {
  return ["/sdcard", "/storage/emulated/0", "/mnt/sdcard", "/storage/self/primary", "/data/local/tmp", "/data/media/0"];
}

async function resolveRemoteDestinationPath(deviceId, destName) {
  const cleanName = destName.replace(/[^a-zA-Z0-9._-]/g, "_");

  for (const rootPath of getCommonDeviceStorageRoots()) {
    const candidatePath = `${rootPath}/${cleanName}`;
    try {
      await runAdb(["-s", deviceId, "shell", "mkdir", "-p", candidatePath]);
      return candidatePath;
    } catch (error) {
      // Try the next common storage location.
    }
  }

  return `/data/local/tmp/${cleanName}`;
}

async function ensureRemoteDirectory(deviceId, remoteDir) {
  try {
    await runAdb(["-s", deviceId, "shell", "mkdir", "-p", remoteDir]);
    return true;
  } catch (error) {
    return false;
  }
}

// Detect whether the installed adb supports --info (byte-accurate progress).
// Newer adb adds it; older versions reject it as an unrecognized option.
let adbSupportsInfo = null;
async function probeAdbSupportsInfo() {
  if (adbSupportsInfo !== null) return adbSupportsInfo;
  try {
    const output = await runAdb(["push", "--help"]);
    adbSupportsInfo = /--info/.test(output);
  } catch (error) {
    adbSupportsInfo = false;
  }
  return adbSupportsInfo;
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const adb = spawn(getAdbExecutable(), args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    adb.stdout.on("data", data => {
      stdout += data.toString();
    });

    adb.stderr.on("data", data => {
      stderr += data.toString();
    });

    adb.on("error", error => reject(error));

    adb.on("close", code => {
      if (code !== 0) {
        return reject(new Error((stderr || stdout || `ADB exited with code ${code}`).trim()));
      }

      const output = stdout.trim() || stderr.trim();
      resolve(output);
    });
  });
}

// Streaming variant: invokes `onLine` for each stdout chunk split by newlines,
// then resolves (or rejects) on close. Use for commands that emit progress lines
// like `adb push` so the renderer can show a live progress bar.
function runAdbStream(args, onLine) {
  return new Promise((resolve, reject) => {
    const adb = spawn(getAdbExecutable(), args, { windowsHide: true });

    let stderr = "";
    let buffer = "";

    const handleChunk = chunk => {
      buffer += chunk.toString();
      const lines = buffer.split(/(?:\r\n|[\r\n])/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line) onLine(line);
      }
    };

    adb.stdout.on("data", handleChunk);
    adb.stderr.on("data", data => {
      stderr += data.toString();
      handleChunk(data);
    });

    adb.on("error", error => reject(error));

    adb.on("close", code => {
      if (buffer) {
        onLine(buffer);
        buffer = "";
      }
      if (code !== 0) {
        return reject(new Error((stderr || `ADB exited with code ${code}`).trim()));
      }
      resolve();
    });
  });
}

function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => !line.startsWith("List of devices") && !line.startsWith("*"))
    .map(line => {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      const status = parts[1];

      if (!serial || !status || status !== "device") {
        return null;
      }

      const modelMatch = line.match(/model:([^\s]+)/);
      const productMatch = line.match(/product:([^\s]+)/);
      const name = modelMatch ? modelMatch[1] : productMatch ? productMatch[1] : "Android Device";

      return { Id: serial, Name: name };
    })
    .filter(Boolean);
}

function listFolderEntries(folderPath) {
  const entries = [];
  const stack = [folderPath];

  while (stack.length) {
    const dir = stack.pop();
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of items) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
          entries.push({
            type: "directory",
            fullPath: full,
            relativePath: path.relative(folderPath, full).split(path.sep).join("/")
          });
        } else if (entry.isFile()) {
          entries.push({
            type: "file",
            fullPath: full,
            relativePath: path.relative(folderPath, full).split(path.sep).join("/"),
            size: fs.statSync(full).size
          });
        }
      } catch (error) {
        // Skip unreadable entries.
      }
    }
  }

  return entries;
}

function getFolderSize(folderPath) {
  return listFolderEntries(folderPath)
    .filter(entry => entry.type === "file")
    .reduce((total, file) => total + file.size, 0);
}

function parseFolders(output, basePath) {
  const folders = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(name => name !== "." && name !== ".." && !name.startsWith("ls:"));

  if (folders.length === 0) {
    return [{ Name: basePath }];
  }

  return folders.map(name => ({ Name: name }));
}

ipcMain.handle("get-devices", async () => {
  try {
    const output = await runAdb(["devices", "-l"]);
    return parseDevices(output);
  } catch (error) {
    return [];
  }
});

ipcMain.handle("get-folders", async (_, deviceId) => {
  const candidates = ["/sdcard", "/storage/emulated/0", "/mnt/sdcard", "/storage/self/primary"];

  for (const basePath of candidates) {
    try {
      const output = await runAdb(["-s", deviceId, "shell", "ls", "-1", basePath]);
      return parseFolders(output, basePath);
    } catch (error) {
      // Try the next common storage path.
    }
  }

  return [{ Name: "/sdcard" }];
});

ipcMain.on("copy-folder", async (event, { deviceId, folderPath, destName }) => {
  try {
    const remotePath = await resolveRemoteDestinationPath(deviceId, destName);

    event.sender.send("copy-progress", { deviceId, percent: 5 });
    await runAdb(["-s", deviceId, "shell", "mkdir", "-p", remotePath]);
    event.sender.send("copy-progress", { deviceId, percent: 10 });

    let lastSent = 10;
    const send = (mapped) => {
      const capped = Math.min(mapped, 99);
      if (capped > lastSent) {
        lastSent = capped;
        event.sender.send("copy-progress", { deviceId, percent: lastSent });
      }
    };

    const entries = listFolderEntries(folderPath);
    const files = entries.filter(entry => entry.type === "file");
    const directories = entries.filter(entry => entry.type === "directory");
    const totalBytes = getFolderSize(folderPath);
    let completedBytes = 0;

    if (files.length === 0) {
      event.sender.send("copy-progress", { deviceId, percent: 100 });
      event.sender.send("copy-finished", { deviceId });
      return;
    }

    for (const directory of directories) {
      const remoteDir = `${remotePath}/${directory.relativePath}`;
      await ensureRemoteDirectory(deviceId, remoteDir);
    }

    for (const file of files) {
      const remoteFilePath = `${remotePath}/${file.relativePath}`;
      const remoteDir = path.posix.dirname(remoteFilePath);

      await ensureRemoteDirectory(deviceId, remoteDir);
      await runAdb(["-s", deviceId, "push", file.fullPath, remoteFilePath]);
      completedBytes += file.size;
      const percent = 10 + Math.round((completedBytes / Math.max(totalBytes, 1)) * 89);
      send(percent);
    }

    event.sender.send("copy-progress", { deviceId, percent: 100 });
    event.sender.send("copy-finished", { deviceId });
  } catch (error) {
    event.sender.send("copy-error", { deviceId, error: error.message });
  }
});
