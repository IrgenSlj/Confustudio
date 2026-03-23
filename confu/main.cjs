'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const isDev = process.env.ELECTRON_IS_DEV === '1';

let mainWindow = null;
let serverProcess = null;

function startServer() {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let portAlreadyInUse = false;

    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    serverProcess = spawn('node', ['server.mjs'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[server] ${output}`);
      if (output.includes('Confusynth listening')) {
        resolveOnce();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[server:err] ${output}`);
      if (output.includes('EADDRINUSE')) {
        portAlreadyInUse = true;
        resolveOnce();
      }
    });

    serverProcess.on('error', (err) => {
      console.error('[server] Failed to start server process:', err);
      reject(err);
    });

    serverProcess.on('exit', (code, signal) => {
      if (code === 0) {
        resolveOnce();
        return;
      }
      if (portAlreadyInUse) {
        resolveOnce();
        return;
      }
      if (code !== 0 && code !== null) {
        console.error(`[server] Server process exited unexpectedly (code ${code}, signal ${signal})`);
      }
    });
  });
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    resizable: true,
    backgroundColor: '#0a0a0a',
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    frame: !isMac,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
  });

  mainWindow.loadURL('http://127.0.0.1:4173');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    killServer();
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('[confu] Could not start server, aborting:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});
