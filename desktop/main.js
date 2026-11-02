const { app, BrowserWindow, shell, Menu, dialog } = require('electron')
const path = require('path')

const APP_URL = process.env.STREAMKARO_URL || 'https://www.streamkaro.aetherdevsolutions.in'

let win = null

/**
 * Is `url` inside the app, and may it load in the shell?
 *
 * SEC-10: the old check was `url.startsWith(APP_URL)`, and APP_URL did not end with a slash —
 * so `https://www.streamkaro.aetherdevsolutions.in.evil.com` passed the prefix test and rendered
 * attacker content inside the app window (which can then phish the real login page). Compare the
 * parsed ORIGIN instead, and treat only our own origin (plus its subdomains) as internal.
 */
function isInternalUrl(rawUrl) {
  try {
    const target = new URL(rawUrl)
    const app = new URL(APP_URL)
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return false
    if (target.origin === app.origin) return true
    // Tenant storefronts are subdomains of the configured base host.
    return target.protocol === app.protocol && target.hostname.endsWith(`.${app.hostname}`)
  } catch {
    return false
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 960,
    minHeight: 560,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    title: 'StreamKaro',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  Menu.setApplicationMenu(null)
  win.loadURL(APP_URL)

  // external links (channel websites, docs) open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternalUrl(url)) {
      e.preventDefault()
      // Only hand real web links to the browser; never let a hostile scheme reach the OS handler.
      if (/^https?:$/.test(safeProtocol(url))) shell.openExternal(url)
    }
  })

  win.on('page-title-updated', (e) => e.preventDefault())

  // Mouse back button / Alt+Left → the page's Back (it keeps a history guard entry while
  // there is somewhere to go back to). F11 toggles fullscreen.
  const goBack = () => {
    if (win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack()
  }
  win.on('app-command', (_e, command) => {
    if (command === 'browser-backward') goBack()
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    } else if (input.alt && input.key === 'ArrowLeft') {
      goBack()
      event.preventDefault()
    }
  })

  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    if (code === -3) return // aborted (normal during redirects)
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'StreamKaro',
      message: 'Cannot reach StreamKaro right now.',
      detail: `${desc} (${code})\n${validatedURL}\n\nCheck your internet connection and press Retry.`,
      buttons: ['Retry', 'Quit'],
    }).then(({ response }) => (response === 0 ? win.reload() : app.quit()))
  })
}

function safeProtocol(rawUrl) {
  try {
    return new URL(rawUrl).protocol
  } catch {
    return ''
  }
}

// DSK-02: a second launch (double-clicking the shortcut again) should focus the existing window
// instead of starting a second copy — two copies share one login cookie and fight over playback.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

if (gotTheLock) {
  app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
