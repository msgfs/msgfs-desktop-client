require('./lib/strfmt/strfmt');
const log = require('electron-log');
const { getKeyList, connectIdentity, createOwnInvite, importIdentityInvite, newIdentity, uploadFile, downloadFile, setDownloadPath,
  uuid4
} = require('./lib/json-api/json-api');
const { getContactList, addContact, removeContact } = require('./lib/contacts')
const { app, BrowserWindow, Menu, Tray, clipboard } = require('electron')
const { isFilePath } = require('./lib/utils')
const { Notification, dialog, shell } = require('electron')
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const prompt = require('electron-prompt');
const {debug} = require("electron-log");
const path = require("path");
const store = new Store();
const {getFolderForId, fileAlreadyDownloaded} = require("./lib/files")

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

        prompt({
          title: 'Input contact name',
          label: 'NAME:',
          value: `${uuid4()}`,
          type: 'input'
        }).then((name) => {
          if (!name) return
          log.info("Import identity", inviteText)
          //const name = 'testName-1';
          const contactFilePath = addContact(el, name, inviteText)
          importIdentityInvite(el, contactFilePath, (resp) => {
            log.info("got response for identity invite: ", resp);
            if (resp.ok) {
              showNotification("msgfs", "Identity invite has been imported.");
            } else {
              removeContact(el, name)
            }
          });
        })


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
    Object.keys(knownFiles).forEach((idFiles) => {
      const idFolder = getFolderForId(idFiles)
      Object.keys(knownFiles[idFiles]).forEach((key) => {
        const fl = knownFiles[idFiles][key]
        if (fl.file !== null && fl.file !== undefined) {
          const downloaded = fileAlreadyDownloaded(idFolder, fl.file.fileName)
          recentFiles.push({
            label: `${fl.file.fileName} ${Math.floor(fl.file.fullSize / (1024 * 1024))}MB` + (downloaded ? ' 🔵' : ' ⚪'),
            click: () => {
              if (downloadPath) { downloadFile(selectedId, parseInt(key), idFolder, () => {
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
      downloadPath ? { label: "Open download folder...", click: () => openDownloadPath() } : { label: "Setup download folder...", click: () => clickDownloadPath() }
  ];

  const contactList = getContactList(knownOwners)
  const contactsMenu = []
  Object.keys(contactList).forEach(k => {
    contactsMenu.push({label: k,  submenu: buildContactSubmenu(contactList[k]) })
  })

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

const buildContactSubmenu = (contacts) => {
  const contactsMenu = []
  Object.keys(contacts).forEach(name => {
    const data = contacts[name] //TODO: для отправки файлов
    const contactClickMenu = [
      { label: "Send file from clipboard", click: () => clickUploadFileClipboard([data.path]) },
      { label: "Send file", click: () => clickUploadFilePath([data.path]) },
      { label: "Received files...", submenu: [
          { label: "No data in protocol"  },
          { type: "separator"},
          { label: "Open download folder...", click: () => openDownloadPath() }
        ] },
    ]
    contactsMenu.push({
      label: name,
      submenu: contactClickMenu
    })
  })
  return contactsMenu
}

let win = null
// Trick for focus
const appFocus = (callback) => {
  app.focus();
  win.show()
  setTimeout(() => win.hide(), 1)
  return callback()
}



openDownloadPath = () => {

  //shell.showItemInFolder(downloadPath+"/")
  shell.openPath(downloadPath+"/")
}

const clickUploadFilePath = (ids) => {
  if (!ids) ids = []
  const res = appFocus(() => { return dialog.showOpenDialogSync({properties: ['openFile']}) })
  if (res && res.length > 0) {
    const uploadPath = res[0];
    uploadFile(selectedId, uploadPath, ids,() => {
      showNotification("msgfs", `file "${uploadPath}" uploaded`);
    })
  }
}

const clickUploadFileClipboard = (ids) => {
  if (!ids) ids = []
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
  uploadFile(selectedId, uploadPath, ids,() => {
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
  win = new BrowserWindow({ width: 100, height: 100, webPreferences: { nativeWindowOpen: true } })
  setTimeout(() => win.hide(), 1)

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
