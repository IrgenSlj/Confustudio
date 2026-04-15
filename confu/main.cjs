'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const isDev = process.env.ELECTRON_IS_DEV === '1';
const preferredPort = Number(process.env.PORT || 4173);

let mainWindow = null;
let serverProcess = null;
let serverPort = preferredPort;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

function getEphemeralPort() {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', reject);
    tester.once('listening', () => {
      const address = tester.address();
      tester.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(address.port);
      });
    });
    tester.listen(0, '127.0.0.1');
  });
}

async function resolveServerPort() {
  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }
  return getEphemeralPort();
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    serverProcess = spawn('node', ['server.mjs'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[server] ${output}`);
      if (output.includes(`CONFUstudio listening on http://127.0.0.1:${port}`)) {
        resolveOnce();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[server:err] ${output}`);
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

function createWindow(port) {
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
      webSecurity: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

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
    serverPort = await resolveServerPort();
    await startServer(serverPort);
    createWindow(serverPort);
  } catch (err) {
    console.error('[confu] Could not start server, aborting:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});
