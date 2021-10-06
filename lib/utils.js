const fs = require('fs')
const path = require("path");
const {app} = require("electron");

const isFilePath = (path) => {
    try {
        if (fs.existsSync(path)) {
            return true
        }
    } catch { }
    return false
}

const isFileExists = (path) => {
    try {
        if (fs.existsSync(path)) {
            return true
        }
    } catch {}
    return false
}



exports.isFilePath = isFilePath
exports.isFileExists = isFileExists
