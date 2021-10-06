const { app } = require('electron')
const path = require('path');
const fs = require('fs');
const Store = require("electron-store");
const {isFileExists} = require("./utils");
const store = new Store();

const getIdsName = (id) => {
    return path.parse(id).base
}

const getFolderForId = (id) => {
    const p = store.get("download-path", null)
    if (id) { return  path.join(p, getIdsName(id)+"/") }
    return p
}

const fileAlreadyDownloaded = (id, fileName) => {
    const fileFullPath = path.join(getFolderForId(id), fileName)
    return isFileExists(fileFullPath);
}

exports.fileAlreadyDownloaded = fileAlreadyDownloaded
exports.getFolderForId = getFolderForId