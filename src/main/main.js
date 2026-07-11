const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const url = require("url");
const fs = require("fs");
const { google } = require("googleapis");
const cron = require("node-cron");
const Store = require("electron-store");
const archiver = require("archiver");

const store = new Store();

let mainWindow;
let cronJob = null;

// ─── OAuth2 Client ────────────────────────────────────────────────────────────
// Users must supply their own credentials from Google Cloud Console.
// Instructions are shown in the app's Settings panel.
function getOAuth2Client() {
	const credentials = store.get("googleCredentials");
	if (!credentials) return null;
	const { clientId, clientSecret } = credentials;
	return new google.auth.OAuth2(
		clientId,
		clientSecret,
		"http://localhost:42813/oauth2callback",
	);
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 900,
		height: 680,
		minWidth: 800,
		minHeight: 600,
		backgroundColor: "#0f1117",
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#0f1117",
			symbolColor: "#a0aec0",
			height: 38,
		},
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
		icon: path.join(__dirname, "../assets/icon.png"),
		show: false,
	});

	mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});
}

app.whenReady().then(() => {
	createWindow();
	restoreCronJob();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

// ─── IPC: App State ───────────────────────────────────────────────────────────
ipcMain.handle("get-state", () => {
	const tokens = store.get("tokens");
	const credentials = store.get("googleCredentials");
	return {
		isConnected: !!(tokens && credentials),
		hasCredentials: !!credentials,
		folders: store.get("folders", []),
		schedule: store.get("schedule", "manual"),
		scheduleTime: store.get("scheduleTime", "02:00"),
		lastBackup: store.get("lastBackup", null),
		backupLog: store.get("backupLog", []),
		userEmail: store.get("userEmail", null),
	};
});

// ─── IPC: Credentials ─────────────────────────────────────────────────────────
ipcMain.handle("save-credentials", (_, { clientId, clientSecret }) => {
	store.set("googleCredentials", { clientId, clientSecret });
	// Clear old tokens when credentials change
	store.delete("tokens");
	store.delete("userEmail");
	return { ok: true };
});

ipcMain.handle("get-credentials", () => {
	return store.get("googleCredentials", null);
});

// ─── IPC: OAuth Flow ──────────────────────────────────────────────────────────
ipcMain.handle("start-auth", async () => {
	const oauth2Client = getOAuth2Client();
	if (!oauth2Client)
		return {
			error:
				"No credentials configured. Please add your Google OAuth credentials first.",
		};

	const authUrl = oauth2Client.generateAuthUrl({
		access_type: "offline",
		// scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
		scope: [
			"https://www.googleapis.com/auth/drive",
			"https://www.googleapis.com/auth/userinfo.email",
		],
		prompt: "consent",
	});

	// Open browser for sign-in
	shell.openExternal(authUrl);

	// Listen for the OAuth redirect on localhost
	return new Promise((resolve) => {
		const server = http.createServer(async (req, res) => {
			const parsed = url.parse(req.url, true);
			if (parsed.pathname === "/oauth2callback") {
				const code = parsed.query.code;
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`<html><body style="font-family:sans-serif;background:#0f1117;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h2 style="color:#4ade80;">✓ Connected!</h2>
            <p>You can close this tab and return to DriveBackup.</p>
          </div></body></html>`);
				server.close();

				try {
					const { tokens } = await oauth2Client.getToken(code);
					oauth2Client.setCredentials(tokens);
					store.set("tokens", tokens);

					// Get user email
					const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
					const userInfo = await oauth2.userinfo.get();
					store.set("userEmail", userInfo.data.email);

					resolve({ ok: true, email: userInfo.data.email });
					mainWindow.webContents.send("auth-complete", {
						email: userInfo.data.email,
					});
				} catch (err) {
					resolve({ error: err.message });
				}
			}
		});

		server.listen(42813);
		setTimeout(() => {
			server.close();
			resolve({ error: "Auth timeout" });
		}, 120000);
	});
});

ipcMain.handle("disconnect", () => {
	store.delete("tokens");
	store.delete("userEmail");
	return { ok: true };
});

// ─── IPC: Folder Management ───────────────────────────────────────────────────
ipcMain.handle("pick-folder", async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openDirectory", "multiSelections"],
		title: "Select folders to back up",
	});
	if (result.canceled) return null;
	return result.filePaths;
});

ipcMain.handle("save-folders", (_, folders) => {
	store.set("folders", folders);
	return { ok: true };
});

// ─── IPC: Schedule ────────────────────────────────────────────────────────────
ipcMain.handle("save-schedule", (_, { schedule, scheduleTime }) => {
	store.set("schedule", schedule);
	store.set("scheduleTime", scheduleTime);
	restoreCronJob();
	return { ok: true };
});

function restoreCronJob() {
	if (cronJob) {
		cronJob.stop();
		cronJob = null;
	}
	const schedule = store.get("schedule", "manual");
	const scheduleTime = store.get("scheduleTime", "02:00");
	if (schedule !== "daily") return;

	const [hour, minute] = scheduleTime.split(":");
	const expression = `${minute} ${hour} * * *`;

	cronJob = cron.schedule(expression, () => {
		runBackup("scheduled");
	});
}

// ─── IPC: Manual Backup ───────────────────────────────────────────────────────
ipcMain.handle("run-backup", async () => {
	return await runBackup("manual");
});

// ─── Core Backup Logic ────────────────────────────────────────────────────────
async function runBackup(trigger = "manual") {
	const folders = store.get("folders", []);
	const tokens = store.get("tokens");
	const credentials = store.get("googleCredentials");

	if (!tokens || !credentials) {
		return { error: "Not connected to Google Drive." };
	}
	if (folders.length === 0) {
		return { error: "No folders selected for backup." };
	}

	// Notify renderer that backup started
	mainWindow?.webContents.send("backup-progress", {
		status: "started",
		trigger,
	});

	const oauth2Client = getOAuth2Client();
	oauth2Client.setCredentials(tokens);

	// Refresh token if needed
	oauth2Client.on("tokens", (newTokens) => {
		const current = store.get("tokens", {});
		store.set("tokens", { ...current, ...newTokens });
	});

	const drive = google.drive({ version: "v3", auth: oauth2Client });

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const results = [];
	let totalSize = 0;
	let errorCount = 0;

	// Get or create root backup folder on Drive
	const rootFolderId = await getOrCreateDriveFolder(drive, "DriveBackup", null);

	for (const folderPath of folders) {
		const folderName = path.basename(folderPath);
		mainWindow?.webContents.send("backup-progress", {
			status: "uploading",
			folder: folderName,
		});

		try {
			// Zip the folder
			const zipPath = await zipFolder(folderPath, timestamp);
			const stats = fs.statSync(zipPath);
			totalSize += stats.size;

			// Get or create named subfolder on Drive
			const subFolderId = await getOrCreateDriveFolder(
				drive,
				folderName,
				rootFolderId,
			);

			// Upload zip
			const zipName = `${folderName}_${timestamp}.zip`;
			await drive.files.create({
				requestBody: {
					name: zipName,
					parents: [subFolderId],
				},
				media: {
					mimeType: "application/zip",
					body: fs.createReadStream(zipPath),
				},
			});

			// Cleanup temp zip
			fs.unlinkSync(zipPath);

			results.push({ folder: folderName, status: "ok", size: stats.size });
		} catch (err) {
			errorCount++;
			results.push({ folder: folderName, status: "error", error: err.message });
		}
	}

	const logEntry = {
		id: Date.now(),
		timestamp: new Date().toISOString(),
		trigger,
		folders: results,
		totalSize,
		errorCount,
	};

	// Keep last 50 log entries
	const log = store.get("backupLog", []);
	log.unshift(logEntry);
	store.set("backupLog", log.slice(0, 50));
	store.set("lastBackup", logEntry.timestamp);

	mainWindow?.webContents.send("backup-progress", {
		status: "done",
		logEntry,
	});

	return { ok: true, logEntry };
}

async function getOrCreateDriveFolder(drive, name, parentId) {
	const q = parentId
		? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
		: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

	const res = await drive.files.list({ q, fields: "files(id)" });
	if (res.data.files.length > 0) return res.data.files[0].id;

	const folder = await drive.files.create({
		requestBody: {
			name,
			mimeType: "application/vnd.google-apps.folder",
			...(parentId ? { parents: [parentId] } : {}),
		},
		fields: "id",
	});
	return folder.data.id;
}

function zipFolder(folderPath, timestamp) {
	return new Promise((resolve, reject) => {
		const tmpDir = app.getPath("temp");
		const zipPath = path.join(tmpDir, `backup_${timestamp}_${Date.now()}.zip`);
		const output = fs.createWriteStream(zipPath);
		const archive = archiver("zip", { zlib: { level: 6 } });

		output.on("close", () => resolve(zipPath));
		archive.on("error", reject);
		archive.pipe(output);
		archive.directory(folderPath, path.basename(folderPath));
		archive.finalize();
	});
}
