"use strict";

// ============================================================
// Ximagine desktop shell — an experimental beta by the Orleia
// project. The app is a hardened browser window around
// https://www.orleia.app/ximagine; all state (chats, built apps)
// stays in that page's localStorage on this device.
//
// Security posture (same rules as the Orleia desktop shell):
//  - contextIsolation on, nodeIntegration off, sandbox on, no preload
//  - hard navigation lockdown: nothing outside our own hosts loads
//    in-window; anything else goes to the system browser or is denied
//  - new-window requests are always denied (opened externally)
//  - permission requests (camera, mic, notifications, geo, ...) denied
// ============================================================

const { app, BrowserWindow, shell, session } = require("electron");

const APP_URL = "https://www.orleia.app/ximagine";
const ALLOWED_HOSTS = new Set(["www.orleia.app", "orleia.app", "app.orleia.app"]);

let mainWindow = null;

function isAllowedInWindow(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function openExternally(url) {
  if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: "#050508",
    show: false,
    title: "Ximagine",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // No preload: the window renders the web app and nothing else.
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Hard navigation lockdown: only our own https hosts may load in-window.
  const guard = (event, url) => {
    if (!isAllowedInWindow(url)) {
      event.preventDefault();
      openExternally(url);
    }
  };
  mainWindow.webContents.on("will-navigate", guard);
  mainWindow.webContents.on("will-redirect", guard);

  // window.open / target=_blank never opens inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  // Beta builds ship without devtools; set XIMAGINE_DEVTOOLS=1 locally (F12).
  if (process.env.XIMAGINE_DEVTOOLS) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("xyz.orleiaapp.ximagine");
    }

    // Deny every powerful web permission this app does not need.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const allowed = permission === "clipboard-sanitized-write";
      callback(allowed);
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    // Ximagine is a tool, not a messenger: closing the window quits.
    app.quit();
  });
}
