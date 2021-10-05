require('./lib/strfmt/strfmt');
const log = require('electron-log');
const { getKeyList, connectIdentity, createOwnInvite, importIdentityInvite, newIdentity, uploadFile, downloadFile, setDownloadPath} = require('./lib/json-api/json-api');
const { app, BrowserWindow, Menu, Tray, clipboard } = require('electron')
const { isFilePath } = require('./lib/utils')
const { Notification, dialog, shell } = require('electron')
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const {debug} = require("electron-log");
const path = require("path");
const store = new Store();

let rotationSpeed = 0
let connect = false
let downloadPath = null

function showNotification (title, body) {
  new Notification({ title: title, body: body }).show()
}

function setupRotatingIcon(tray) {
  let rotationAngle = 0;
  setInterval(() => {
    rotationAngle += rotationSpeed
    if (rotationAngle > 360) {
      rotationAngle = 0;
    }
    rotationString = "%03d".$(rotationAngle);
    res = tray.setImage('assets/logo-rotated/ozekon-20x20-' + rotationString +  '.png');
  }, 16)
}


const identitiesStates = {};
var selectedId = null

function identityToggle(id, tray, knownOwners, currentConnections, currentConnectionsPing, knownFiles) {
  identitiesStates[id] = !currentConnections[id];
  buildTrayMenu(tray, knownOwners, currentConnections, currentConnectionsPing, knownFiles);
  if (identitiesStates[id]) {
    connectIdentity(id, (resp) => {
      selectedId = id
      log.info("idenitity connection requested: ", resp);
    });
  }
}

function buildTrayMenu(tray, knownOwners, currentConnections, currentConnectionsPing, knownFiles) {
  const identitiesMenu = [
      { label: "New idenity...", click: () => newIdentity(() => {
          showNotification("msgfs", "New identity created");
      })},
      { type: "separator" }];

  let nActive = 0;

  const onlyIdentitiesMenu = [];
  const importIdentitiesInvite = [];

  knownOwners.forEach((el) => {
    let ms = ""

    if (currentConnectionsPing[el] !== null && currentConnectionsPing[el] !== undefined) {
      ms = `[${currentConnectionsPing[el]}ms]`
      nActive++;
      if (currentConnectionsPing[el]) selectedId = el
    }

    const idMenuRecord = { 
      label: `${el} ${ms}`, 
      type: "checkbox", 
      checked: currentConnections[el]};

    identitiesMenu.push({...idMenuRecord, click: () => {
      identityToggle(el, tray, knownOwners, currentConnections, currentConnectionsPing, knownFiles);
    }});

    importIdentitiesInvite.push({...idMenuRecord, click: () => {
      const inviteText = clipboard.readText();
      if (inviteText !== '') {
        log.info("Import identity", inviteText)
        importIdentityInvite(el, inviteText, (resp) => {
          log.info("got response for identity invite: ", resp);
          if (resp.ok) {
            showNotification("msgfs", "Identity invite has been imported.");
          }
        });
      } else {
        showNotification('msgfs', 'not text found in clipboard');
      }
    }})

    onlyIdentitiesMenu.push({...idMenuRecord, click: () => {
      createOwnInvite(el, (path, resp) => {
        log.info("identity invite creation requested at ", path, resp);
        const fileData = fs.readFileSync(path);
        clipboard.writeText(fileData.toString('base64'));
        showNotification("msgfs", "invite has been copied to clipboard");
      });
    }});
  });

  rotationSpeed = nActive;

  const recentFiles = [];
  if (knownFiles !== null && knownFiles !== undefined) {
    Object.keys(knownFiles).forEach((idFiles, index) => {
      knownFiles[idFiles].forEach((fl) => {
        if (fl.file !== null && fl.file !== undefined) {
          recentFiles.push({
            label: `${fl.file.fileName} ${Math.floor(fl.file.fullSize / (1024 * 1024))}MB ✔️`,
            click: () => {
              if (downloadPath) { downloadFile(selectedId, index, downloadPath, () => {
                showNotification("msgfs", `File ${fl.file.fileName} has been downloaded`);
              }) } else {
                showNotification("msgfs", `Setup download path`);
              }
            }
          });
        }
      });
    });
  }

  const recentlyReceivedFilesMenu = [
      ...recentFiles,
      { type: "separator"},
      downloadPath ? { label: "Open containg folder...", click: () => openDownloadPath() } : { label: "Setup download folder...", click: () => clickDownloadPath() }
  ];


  const contactsMenu = [
      { label: "my, myself and I", type: "checkbox", checked: true},
      { label: "demo receiver", type: "checkbox", }
  ]

  const contextMenu = Menu.buildFromTemplate([
    { label: "Identities", submenu: Menu.buildFromTemplate(identitiesMenu)},
    { label: "Contacts", submenu: Menu.buildFromTemplate(contactsMenu)},
    { type: "separator" },
    { label: "Import contact from clipboard...", submenu: Menu.buildFromTemplate(importIdentitiesInvite)},
    { label: "Copy idenitity invite to clipboard", submenu: Menu.buildFromTemplate(onlyIdentitiesMenu)},
    { label: "Recently received files", submenu: Menu.buildFromTemplate(recentlyReceivedFilesMenu)},
    { type: "separator" },
    { label: "Send file", click: () => clickUploadFilePath() },
    { label: "Send from the clipboard", click: () => clickUploadFileClipboard() },
    { type: "separator" },
    { label: "Set download path", click: () => { clickDownloadPath() }}
  ]);
  tray.setTitle("msg-fs");
  tray.setContextMenu(contextMenu);
}

let win = null
// Trick for focus
const appFocus = (callback) => {
  app.focus();
  if (!win) {
    win = new BrowserWindow({ width: 100, height: 100, webPreferences: { nativeWindowOpen: true } })
  } else win.show()
  setTimeout(() => win.hide(), 1)
  return callback()
}

const clickUploadFilePath = () => {
  const res = appFocus(() => { return dialog.showOpenDialogSync({properties: ['openFile']}) })
  if (res && res.length > 0) {
    const uploadPath = res[0];
    uploadFile(selectedId, uploadPath, [selectedId],() => {
      showNotification("msgfs", `file "${uploadPath}" uploaded`);
    })
  }
}

openDownloadPath = () => { shell.showItemInFolder(downloadPath) }

const clickUploadFileClipboard = () => {
  let uploadPath = null
  if (os.platform() === "win32") {
    const rawFilePath = clipboard.read('FileNameW');
    uploadPath = rawFilePath.replace(new RegExp(String.fromCharCode(0), 'g'), '');
  } else {
    uploadPath = clipboard.read('public.file-url').replace('file://', '');
  }
  if (!isFilePath(uploadPath)) {
    showNotification("msgfs", `Is not "file-path" in clipboard`);
    return
  }
  uploadFile(selectedId, uploadPath, [],() => {
    showNotification("msgfs", `file "${uploadPath}" uploaded`);
  })

}

const clickDownloadPath = () => {
  const res = appFocus(() => { return dialog.showOpenDialogSync({properties: ['openDirectory']}) })
  if (res && res.length > 0) {
    log.info("download path to", res[0])
    downloadPath = res[0];
    store.set("download-path", downloadPath)
    setDownloadPath(selectedId, downloadPath)
  }
}

app.whenReady().then(() => {
  log.transports.console.level = 'info';
  const tray = new Tray('assets/disconnect.png');
  let knownIdentites = 0
  //setupRotatingIcon(tray);
  buildTrayMenu(tray, []);
  downloadPath = store.get("download-path")
  setInterval(() => {
    getKeyList((keylist) => {
      if (keylist.ok) {
        connect = true
        tray.setImage('assets/ready.png')
        keylist.known_owners.forEach((el) => {
          const currentValue = identitiesStates[el];
          if (currentValue === null || currentValue === undefined) {
            identitiesStates[el] = false;
          }
        });

        if (keylist.known_owners.length !== knownIdentites) {
          knownIdentites = keylist.known_owners.length;
          showNotification("msgfs", `daemon reports ${keylist.known_owners.length} locally known owners.`);
        }
        buildTrayMenu(tray, keylist.known_owners, keylist.current_connections, keylist.current_connections_ping, keylist.KnownFiles)
      } else {
        tray.setImage('assets/disconnect.png')
      }
    });
  }, 1000)
});
