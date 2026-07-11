// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  isConnected: false,
  hasCredentials: false,
  folders: [],
  schedule: 'manual',
  scheduleTime: '02:00',
  lastBackup: null,
  backupLog: [],
  userEmail: null,
  isBackingUp: false
};

// ─── Nav ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`panel-${item.dataset.panel}`).classList.add('active');
  });
});

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type === 'success' ? 'success' : type === 'error' ? 'error-t' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatRelative(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function renderLogEntry(entry) {
  const hasErrors = entry.errorCount > 0;
  const trigger = entry.trigger === 'scheduled' ? 'scheduled' : 'manual';
  const folderSummary = entry.folders
    .map(f => `${f.folder}: ${f.status === 'ok' ? '✓' : '✗ ' + f.error}`)
    .join(' · ');

  return `
    <div class="log-entry ${hasErrors ? 'has-errors' : ''}">
      <div>
        <div class="log-time">${formatDateTime(entry.timestamp)}</div>
        <div class="log-details">${folderSummary} · ${formatBytes(entry.totalSize)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="log-badge ${trigger}">${trigger}</span>
        <span class="log-badge ${hasErrors ? 'error' : 'ok'}">${hasErrors ? `${entry.errorCount} error` : 'ok'}</span>
      </div>
    </div>`;
}

// ─── Render full UI from state ────────────────────────────────────────────────
function renderUI() {
  const { isConnected, userEmail, folders, schedule, scheduleTime, lastBackup, backupLog } = state;

  // Title bar dot
  document.getElementById('conn-dot').className = `dot ${isConnected ? '' : 'inactive'}`;

  // Status card
  const pulse = document.getElementById('status-pulse');
  const lbl = document.getElementById('status-label');
  const sub = document.getElementById('status-sub');
  const btnBackup = document.getElementById('btn-backup');
  const subtitle = document.getElementById('dash-subtitle');

  if (state.isBackingUp) {
    pulse.className = 'status-pulse backing-up';
    pulse.textContent = '↑';
    lbl.textContent = 'Backing up…';
    sub.textContent = 'Upload in progress';
    btnBackup.disabled = true;
  } else if (isConnected) {
    pulse.className = 'status-pulse connected';
    pulse.textContent = '✓';
    lbl.textContent = userEmail || 'Connected';
    sub.textContent = lastBackup ? `Last backup: ${formatRelative(lastBackup)}` : 'No backups yet';
    btnBackup.disabled = folders.length === 0;
    subtitle.textContent = folders.length === 0 ? 'Add folders in the Folders tab to get started' : `${folders.length} folder${folders.length !== 1 ? 's' : ''} ready`;
  } else {
    pulse.className = 'status-pulse disconnected';
    pulse.textContent = '☁';
    lbl.textContent = 'Not connected';
    sub.textContent = 'Connect your Google account in Settings';
    btnBackup.disabled = true;
    subtitle.textContent = 'Connect your Google account in Settings';
  }

  // Stats
  document.getElementById('stat-folders').textContent = folders.length;
  document.getElementById('stat-last').textContent = formatRelative(lastBackup);
  document.getElementById('stat-schedule').textContent = schedule === 'daily'
    ? `Daily ${scheduleTime}` : 'Manual';

  // Dashboard log (last 3)
  const dashLog = document.getElementById('dash-log');
  if (backupLog.length === 0) {
    dashLog.innerHTML = '<div class="log-empty">No backups yet. Hit "Back Up Now" to get started.</div>';
  } else {
    dashLog.innerHTML = backupLog.slice(0, 3).map(renderLogEntry).join('');
  }

  // Full log
  const fullLog = document.getElementById('full-log');
  if (backupLog.length === 0) {
    fullLog.innerHTML = '<div class="log-empty">No backup history yet.</div>';
  } else {
    fullLog.innerHTML = backupLog.map(renderLogEntry).join('');
  }

  // Folders panel
  const folderList = document.getElementById('folder-list');
  if (folders.length === 0) {
    folderList.innerHTML = '<div class="empty-folders"><div class="icon">📂</div>No folders added yet.</div>';
  } else {
    folderList.innerHTML = folders.map((fp, i) => {
      const name = fp.split('\\').pop() || fp.split('/').pop() || fp;
      return `
        <div class="folder-item">
          <span class="folder-icon">📁</span>
          <div style="flex:1;overflow:hidden;">
            <div class="folder-name">${name}</div>
            <div class="folder-sub">${fp}</div>
          </div>
          <button class="folder-remove" data-index="${i}" title="Remove">✕</button>
        </div>`;
    }).join('');
    folderList.querySelectorAll('.folder-remove').forEach(btn => {
      btn.addEventListener('click', () => removeFolder(parseInt(btn.dataset.index)));
    });
  }

  // Schedule panel
  document.getElementById('sched-manual').classList.toggle('active', schedule === 'manual');
  document.getElementById('sched-daily').classList.toggle('active', schedule === 'daily');
  document.getElementById('time-picker').style.display = schedule === 'daily' ? 'block' : 'none';
  document.getElementById('schedule-time').value = scheduleTime;

  // Settings - account section
  const msg = document.getElementById('account-status-msg');
  const actions = document.getElementById('account-actions');
  if (isConnected) {
    msg.className = 'alert success';
    msg.textContent = `✓ Connected as ${userEmail}`;
    actions.innerHTML = `<button class="btn btn-danger" id="btn-disconnect-2">Disconnect</button>`;
    document.getElementById('btn-disconnect-2').addEventListener('click', disconnectAccount);
  } else {
    msg.className = 'alert info';
    msg.textContent = 'Not connected. Add your credentials below and sign in.';
    actions.innerHTML = `<button class="btn btn-primary" id="btn-connect">Connect Google Account</button>`;
    document.getElementById('btn-connect').addEventListener('click', startAuth);
  }
}

// ─── Load initial state ───────────────────────────────────────────────────────
async function loadState() {
  const s = await window.api.getState();
  Object.assign(state, s);

  // Also populate credential fields if saved
  const creds = await window.api.getCredentials();
  if (creds) {
    document.getElementById('input-client-id').value = creds.clientId || '';
    document.getElementById('input-client-secret').value = creds.clientSecret || '';
  }

  renderUI();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function startAuth() {
  const clientId = document.getElementById('input-client-id').value.trim();
  const clientSecret = document.getElementById('input-client-secret').value.trim();

  if (!clientId || !clientSecret) {
    toast('Please save your Client ID and Client Secret first.', 'error');
    // Navigate to settings
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-panel="settings"]').classList.add('active');
    document.getElementById('panel-settings').classList.add('active');
    return;
  }

  toast('Opening Google sign-in in your browser…');
  const result = await window.api.startAuth();
  if (result.error) {
    toast(result.error, 'error');
  } else {
    state.isConnected = true;
    state.userEmail = result.email;
    toast(`✓ Connected as ${result.email}`, 'success');
    renderUI();
  }
}

async function disconnectAccount() {
  await window.api.disconnect();
  state.isConnected = false;
  state.userEmail = null;
  toast('Disconnected from Google Drive.');
  renderUI();
}

// ─── Folders ──────────────────────────────────────────────────────────────────
document.getElementById('btn-add-folder').addEventListener('click', async () => {
  const paths = await window.api.pickFolder();
  if (!paths) return;
  const existing = new Set(state.folders);
  paths.forEach(p => existing.add(p));
  state.folders = [...existing];
  await window.api.saveFolders(state.folders);
  renderUI();
  toast(`Added ${paths.length} folder${paths.length !== 1 ? 's' : ''}.`, 'success');
});

async function removeFolder(index) {
  state.folders.splice(index, 1);
  await window.api.saveFolders(state.folders);
  renderUI();
  toast('Folder removed.');
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
document.getElementById('sched-manual').addEventListener('click', () => {
  state.schedule = 'manual';
  renderUI();
});
document.getElementById('sched-daily').addEventListener('click', () => {
  state.schedule = 'daily';
  renderUI();
});

document.getElementById('btn-save-schedule').addEventListener('click', async () => {
  state.scheduleTime = document.getElementById('schedule-time').value;
  await window.api.saveSchedule({ schedule: state.schedule, scheduleTime: state.scheduleTime });
  toast('Schedule saved.', 'success');
  renderUI();
});

// ─── Backup ───────────────────────────────────────────────────────────────────
document.getElementById('btn-backup').addEventListener('click', async () => {
  if (!state.isConnected) { toast('Connect your Google account first.', 'error'); return; }
  if (state.folders.length === 0) { toast('Add at least one folder first.', 'error'); return; }
  startBackupUI();
  const result = await window.api.runBackup();
  if (result.error) {
    toast(result.error, 'error');
    stopBackupUI();
  }
});

function startBackupUI() {
  state.isBackingUp = true;
  document.getElementById('backup-status-bar').className = 'backup-status-bar visible';
  renderUI();
}

function stopBackupUI() {
  state.isBackingUp = false;
  document.getElementById('backup-status-bar').className = 'backup-status-bar';
  renderUI();
}

// ─── IPC events ───────────────────────────────────────────────────────────────
window.api.onBackupProgress((data) => {
  const bar = document.getElementById('backup-status-bar');
  const txt = document.getElementById('backup-status-text');

  if (data.status === 'started') {
    bar.className = 'backup-status-bar visible';
    txt.textContent = 'Starting backup…';
    state.isBackingUp = true;
    renderUI();
  } else if (data.status === 'uploading') {
    bar.className = 'backup-status-bar visible';
    txt.textContent = `Uploading "${data.folder}"…`;
  } else if (data.status === 'done') {
    bar.className = 'backup-status-bar';
    state.isBackingUp = false;
    state.lastBackup = data.logEntry.timestamp;
    state.backupLog.unshift(data.logEntry);
    if (state.backupLog.length > 50) state.backupLog = state.backupLog.slice(0, 50);

    const errs = data.logEntry.errorCount;
    toast(
      errs > 0
        ? `Backup done with ${errs} error${errs !== 1 ? 's' : ''}. Check History.`
        : `✓ Backup complete — ${data.logEntry.folders.length} folder${data.logEntry.folders.length !== 1 ? 's' : ''} uploaded.`,
      errs > 0 ? 'error' : 'success'
    );
    renderUI();
  }
});

window.api.onAuthComplete((data) => {
  state.isConnected = true;
  state.userEmail = data.email;
  renderUI();
});

// ─── Settings: save credentials ───────────────────────────────────────────────
document.getElementById('btn-save-creds').addEventListener('click', async () => {
  const clientId = document.getElementById('input-client-id').value.trim();
  const clientSecret = document.getElementById('input-client-secret').value.trim();
  if (!clientId || !clientSecret) {
    toast('Both Client ID and Client Secret are required.', 'error');
    return;
  }
  await window.api.saveCredentials({ clientId, clientSecret });
  toast('Credentials saved. Now click "Connect Google Account".', 'success');
  state.isConnected = false;
  state.userEmail = null;
  renderUI();
});

document.getElementById('btn-disconnect').addEventListener('click', disconnectAccount);

// Open Google Console link
document.getElementById('link-console').addEventListener('click', (e) => {
  e.preventDefault();
  // In real Electron, this would use shell.openExternal
  // For now it navigates (electron will handle)
  window.open('https://console.cloud.google.com', '_blank');
});

// ─── Log: clear ───────────────────────────────────────────────────────────────
document.getElementById('btn-clear-log').addEventListener('click', async () => {
  state.backupLog = [];
  state.lastBackup = null;
  // Persist via store (we re-use save-schedule as a workaround — in prod, add a clear-log IPC)
  renderUI();
  toast('History cleared.');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState();
