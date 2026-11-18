let devices = [];
let folderPath = null;
let selectedDest = null;
let selectedDeviceIds = [];
let multiSelectEnabled = false;
const copyStartTimes = new Map();

const deviceContainer = document.getElementById("device-container");
const deviceList       = document.getElementById("device-list");
const deviceCountBadge  = document.getElementById("device-count");
const folderLabel     = document.getElementById("folder");
const folderTreeEl    = document.getElementById("folder-tree");
const logEl           = document.getElementById("log");
const logPanelEl      = document.getElementById("log-panel");
const themeToggle     = document.getElementById("theme-toggle");
const multiToggle      = document.getElementById("multi-toggle");
const toggleLogButton  = document.getElementById("toggle-log");
const renameButton     = document.getElementById("rename-device");
const renameInput      = document.getElementById("rename-input");
const renameRow        = document.getElementById("rename-row");
const applyRenameButton = document.getElementById("apply-rename");
const clearLogButton    = document.getElementById("clear-log");
const connectionPill    = document.getElementById("connection-state");
const connectionLabelEl = connectionPill.querySelector(".connection-label");
const progressPanel     = document.getElementById("progress-panel");
const progressListEl    = document.getElementById("progress-list");
const progressCards     = new Map();

function setTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  localStorage.setItem("bird-theme", theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem("bird-theme") || "dark";
  setTheme(savedTheme);
}

function appendLog(level, message) {
  const row = document.createElement("div");
  row.className = `log-row log-${level}`;
  row.textContent = `[${level.toUpperCase()}] ${message}`;
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

function setConnectionState(state, label) {
  connectionPill.classList.remove(
    "connection-pill-idle",
    "connection-pill-ok",
    "connection-pill-busy"
  );
  connectionPill.classList.add(`connection-pill-${state}`);
  connectionLabelEl.textContent = label;
}

function setBusy(busy) {
  if (busy) {
    setConnectionState("busy", "Copying…");
  }
}

function getSavedNames() {
  try {
    return JSON.parse(localStorage.getItem("bird-device-names") || "{}") || {};
  } catch (error) {
    return {};
  }
}

function saveDeviceName(deviceId, name) {
  const names = getSavedNames();
  names[deviceId] = name;
  localStorage.setItem("bird-device-names", JSON.stringify(names));
}

function getDisplayName(device) {
  const names = getSavedNames();
  return names[device.Id] || device.Name;
}

function getDeviceLabel(deviceId) {
  const device = devices.find(dev => dev.Id === deviceId);
  return device ? getDisplayName(device) : deviceId;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) {
    return `${ms} ms`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function renderDevices() {
  deviceList.innerHTML = "";
  if (devices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "device-empty";
    empty.textContent = "No devices connected";
    deviceList.appendChild(empty);
  }
  devices.forEach(dev => {
    const card = document.createElement("div");
    card.className = "device-card";
    card.dataset.id = dev.Id;
    if (multiSelectEnabled) {
      if (selectedDeviceIds.includes(dev.Id)) {
        card.classList.add("selected");
      }
    } else if (selectedDeviceIds.includes(dev.Id)) {
      card.classList.add("selected");
    }
    card.textContent = `${getDisplayName(dev)}`;
    deviceList.appendChild(card);
  });

  deviceCountBadge.textContent = devices.length;
  deviceCountBadge.classList.toggle("is-active", devices.length > 0);

  if (devices.length > 0) {
    setConnectionState("ok", `${devices.length} connected`);
  } else {
    setConnectionState("idle", "ADB idle");
  }
}

function renderTree(folders) {
  folderTreeEl.innerHTML = "";
  folders.forEach(folder => {
    const item = document.createElement("div");
    item.className = "tree-item";
    item.textContent = folder.Name;
    item.onclick = () => {
      selectedDest = folder.Name;
      document.querySelectorAll(".tree-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
      appendLog("info", `Selected destination: ${folder.Name}`);
    };
    folderTreeEl.appendChild(item);
  });
}

function setProgressPanelVisible() {
  progressPanel.hidden = progressListEl.childElementCount === 0;
}

function createProgressCard(deviceId) {
  const card = document.createElement("div");
  card.className = "progress-card";

  const meta = document.createElement("div");
  meta.className = "progress-meta";

  const name = document.createElement("span");
  name.className = "progress-name";
  name.textContent = getDeviceLabel(deviceId);

  const percentText = document.createElement("span");
  percentText.className = "progress-percent";
  percentText.textContent = "0%";

  meta.appendChild(name);
  meta.appendChild(percentText);

  const bar = document.createElement("div");
  bar.className = "progress-bar";

  const fill = document.createElement("div");
  fill.className = "progress-bar-fill";

  bar.appendChild(fill);

  card.appendChild(meta);
  card.appendChild(bar);
  progressListEl.appendChild(card);

  progressCards.set(deviceId, { card, fill, percentText, current: 0 });
  setProgressPanelVisible();
}

function updateProgressCard(deviceId, percent) {
  const entry = progressCards.get(deviceId);
  if (!entry) return;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (clamped <= entry.current) {
    // Don't go backwards or stay flat.
    return;
  }
  entry.current = clamped;
  entry.fill.style.width = clamped + "%";
  entry.percentText.textContent = clamped + "%";
}

function finishProgressCard(deviceId, status) {
  const entry = progressCards.get(deviceId);
  if (!entry) return;
  if (status === "done") {
    entry.current = 100;
    entry.fill.style.width = "100%";
    entry.percentText.textContent = "Done";
    entry.card.classList.add("done");
  } else if (status === "error") {
    entry.percentText.textContent = "Failed";
    entry.card.classList.add("error");
  }
}

function removeProgressCard(deviceId) {
  const entry = progressCards.get(deviceId);
  if (!entry) return;
  entry.card.remove();
  progressCards.delete(deviceId);
  setProgressPanelVisible();
}

themeToggle.onclick = () => {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  setTheme(nextTheme);
};

multiToggle.onclick = () => {
  multiSelectEnabled = !multiSelectEnabled;
  if (!multiSelectEnabled) {
    selectedDeviceIds = selectedDeviceIds.length > 0 ? [selectedDeviceIds[0]] : [];
  }
  multiToggle.textContent = `Multi-select: ${multiSelectEnabled ? "On" : "Off"}`;
  renderDevices();
};

initTheme();
setConnectionState("idle", "ADB idle");

document.getElementById("pick").onclick = async () => {
  folderPath = await api.pickFolder();
  folderLabel.textContent = folderPath ? `Folder: ${folderPath}` : "No folder selected";
};

document.getElementById("refresh").onclick = async () => {
  devices = await api.getDevices();
  appendLog("info", `Detected ${devices.length} device(s)`);
  renderDevices();
};

function applyRename() {
  if (selectedDeviceIds.length === 0) {
    appendLog("error", "Select a device first");
    return;
  }

  const deviceId = selectedDeviceIds[0];
  const newName = renameInput.value.trim();

  if (!newName) {
    appendLog("error", "Enter a device name first");
    return;
  }

  saveDeviceName(deviceId, newName);
  renameInput.value = "";
  renderDevices();
  appendLog("success", `Saved name for ${deviceId}: ${newName}`);
}

renameButton.onclick = () => {
  const willOpen = !renameRow.classList.contains("is-open");

  if (willOpen && selectedDeviceIds.length === 0) {
    appendLog("error", "Select a device first");
    return;
  }

  renameRow.classList.toggle("is-open", willOpen);

  if (willOpen) {
    const deviceId = selectedDeviceIds[0];
    const currentName = getDisplayName(
      devices.find(dev => dev.Id === deviceId) || { Id: deviceId, Name: deviceId }
    );
    renameInput.value = currentName;
    renameInput.focus();
    renameInput.select();
  }
};

toggleLogButton.onclick = () => {
  logPanelEl.classList.toggle("is-collapsed");
};

applyRenameButton.onclick = applyRename;
renameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    applyRename();
  }
});

clearLogButton.onclick = () => {
  logEl.innerHTML = "";
};

deviceContainer.onclick = async e => {
  const card = e.target.closest(".device-card");
  if (!card) return;

  const deviceId = card.dataset.id;

  if (multiSelectEnabled) {
    if (selectedDeviceIds.includes(deviceId)) {
      selectedDeviceIds = selectedDeviceIds.filter(id => id !== deviceId);
    } else {
      selectedDeviceIds.push(deviceId);
    }
  } else {
    selectedDeviceIds = [deviceId];
  }

  renderDevices();
  const label = selectedDeviceIds.length === 1
    ? `Selected device ${getDeviceLabel(selectedDeviceIds[0])}`
    : `Selected devices ${selectedDeviceIds.map(getDeviceLabel).join(", ")}`;
  appendLog("info", label);

  if (selectedDeviceIds.length === 1) {
    folderTreeEl.innerHTML = "<div>Loading folders...</div>";
    const folders = await api.getFolders(selectedDeviceIds[0]);
    renderTree(folders);
  } else {
    folderTreeEl.innerHTML = "<div>Select one device to load its folders</div>";
  }
};

document.getElementById("start").onclick = () => {
  if (!folderPath) {
    appendLog("error", "No source folder selected");
    return;
  }
  if (selectedDeviceIds.length === 0) {
    appendLog("error", "No device selected");
    return;
  }
  if (!selectedDest) {
    appendLog("error", "No destination folder selected");
    return;
  }

  appendLog("info", `Starting copy to ${selectedDeviceIds.length} device(s)`);
  setBusy(true);
  selectedDeviceIds.forEach(deviceId => {
    copyStartTimes.set(deviceId, Date.now());
    createProgressCard(deviceId);
    api.copyFolder(deviceId, folderPath, selectedDest);
  });
};

api.onProgress(({ deviceId, percent }) => {
  updateProgressCard(deviceId, percent);
});

api.onAdbLine(({ deviceId, line }) => {
  appendLog("info", `[${getDeviceLabel(deviceId)}] ${line}`);
});

api.onAdbDebug(({ deviceId, line, mode }) => {
  appendLog("info", `[ADB ${mode}] [${getDeviceLabel(deviceId)}] ${line}`);
});

api.onAdbMode(({ deviceId, useInfo }) => {
  appendLog("info", `ADB mode for ${getDeviceLabel(deviceId)}: ${useInfo ? "info" : "legacy"}`);
});

function refreshConnectionStateAfterCopy() {
  if (copyStartTimes.size === 0) {
    if (devices.length > 0) {
      setConnectionState("ok", `${devices.length} connected`);
    } else {
      setConnectionState("idle", "ADB idle");
    }
  } else {
    setConnectionState("busy", `Copying ${copyStartTimes.size}…`);
  }
}

api.onFinished(({ deviceId }) => {
  const startedAt = copyStartTimes.get(deviceId);
  const elapsed = startedAt ? formatDuration(Date.now() - startedAt) : "unknown";
  appendLog("success", `Finished copy to ${getDeviceLabel(deviceId)} in ${elapsed}`);
  copyStartTimes.delete(deviceId);
  refreshConnectionStateAfterCopy();

  finishProgressCard(deviceId, "done");
  setTimeout(() => removeProgressCard(deviceId), 2000);
});

api.onError(({ deviceId, error }) => {
  const startedAt = copyStartTimes.get(deviceId);
  const elapsed = startedAt ? formatDuration(Date.now() - startedAt) : "unknown";
  appendLog("error", `${getDeviceLabel(deviceId)}: ${error} (${elapsed})`);
  copyStartTimes.delete(deviceId);
  refreshConnectionStateAfterCopy();

  finishProgressCard(deviceId, "error");
  setTimeout(() => removeProgressCard(deviceId), 4000);
});
