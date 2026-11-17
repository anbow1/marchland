// Marchland for Windows: a window onto the game on GitHub Pages. The game's service worker keeps every
// file on the disk after the first start (with the internet), so later starts play offline, and a new
// version downloads by itself, only what changed. This shell changes only when Electron does.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const GAME = process.env.MARCHLAND_URL || 'https://anbow1.github.io/FPS/marchland/';

app.setName('Marchland');
Menu.setApplicationMenu(null);

function open() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#1b2740',
    icon: path.join(__dirname, 'icon.png'),
    title: 'Marchland',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.maximize();
  win.once('ready-to-show', () => win.show());
  // F11: full screen; F5: reload; Ctrl+Shift+I: the developer tools (for reports).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F5') {
      win.webContents.reload();
      event.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  // Links out of the game open in the browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // The very first start needs the internet; without it, a page that says so and tries again.
  win.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: aborted by a newer navigation
    void win.loadFile(path.join(__dirname, 'offline.html'), { query: { game: GAME, failed: url } });
  });
  void win.loadURL(GAME);
}

app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());
