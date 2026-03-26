import { BrowserWindow, shell, screen } from 'electron';
import { rendererAppName, rendererAppPort } from './constants';
import { environment } from '../environments/environment';
import { startServer, stopServer } from './server';
import { join } from 'path';
import { format } from 'url';

export default class App {
  static mainWindow: BrowserWindow | null = null;
  static application: Electron.App;
  static BrowserWindow: typeof BrowserWindow;

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment = () =>
      parseInt(process.env.ELECTRON_IS_DEV!, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment() : !environment.production;
  }

  private static onWindowAllClosed() {
    stopServer();
    App.application.quit();
  }

  private static onClose() {
    App.mainWindow = null;
  }

  private static async onReady() {
    console.log(`onReady called, rendererAppName=${rendererAppName}`);
    if (!rendererAppName) return;

    // Start the task-manager backend before opening the window
    try {
      await startServer();
      console.log('startServer completed');
    } catch (err: any) {
      console.log(`Failed to start task-manager: ${err?.message || err}`);
    }

    App.initMainWindow();
    App.loadMainWindow();
    console.log('Window loaded');
  }

  private static onActivate() {
    if (App.mainWindow === null) {
      App.onReady();
    }
  }

  private static initMainWindow() {
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1280, workAreaSize.width || 1280);
    const height = Math.min(800, workAreaSize.height || 800);

    App.mainWindow = new BrowserWindow({
      width: width,
      height: height,
      show: false,
      backgroundColor: '#0d1117',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: {
        contextIsolation: true,
        backgroundThrottling: false,
        preload: join(__dirname, 'main.preload.js'),
      },
    });
    App.mainWindow.setMenu(null);
    App.mainWindow.center();

    App.mainWindow.once('ready-to-show', () => {
      App.mainWindow!.show();
    });

    App.mainWindow.on('closed', () => {
      App.mainWindow = null;
    });
  }

  private static loadMainWindow() {
    if (!App.application.isPackaged) {
      App.mainWindow!.loadURL(`http://localhost:${rendererAppPort}`);
    } else {
      App.mainWindow!.loadURL('http://localhost:3001');
    }
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    console.log('App.main called');
    App.BrowserWindow = browserWindow;
    App.application = app;

    // Prevent multiple instances
    if (!App.application.requestSingleInstanceLock()) {
      console.log('Single instance lock failed, quitting');
      App.application.quit();
      return;
    }

    console.log('Registering event handlers');
    App.application.on('window-all-closed', App.onWindowAllClosed);
    App.application.on('ready', App.onReady);
    App.application.on('activate', App.onActivate);
    App.application.on('before-quit', stopServer);
  }
}
