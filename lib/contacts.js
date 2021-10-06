const { app } = require('electron')
const path = require('path');
const fs = require('fs');
const { isFileExists } = require("./utils")
let currentContactList = null;

// ~/.msg-fs/id.bin -> id.bin
const getIdsName = (id) => {
    return path.parse(id).base
}

const getContactFolderForId = (id) => {
    const p = path.join(app.getPath('appData'), `contacts/${getIdsName(id)}/`)
    fs.mkdirSync(p, { recursive: true });
    return p;
}


const reContactName = new RegExp('(\\w+)\\.incoming\\.bin');
const getContactList = (ids) => {
    //if (currentContactList) return currentContactList
    const res = {}
    ids.forEach(id => {
        res[id] = {}
        const contactPath = getContactFolderForId(id)
        const contactFiles = fs.readdirSync(contactPath)
        contactFiles.forEach(contactFile => {
            if (path.extname(contactFile) === '.bin') {
                const match = reContactName.exec(path.parse(contactFile).base)
                if (match[0]) {
                    res[id][match[1]] = {
                        name: match[1],
                        path: path.join(contactPath, contactFile),
                        id: id,
                    }
                    // res[id].push({
                    //     name: match[1],
                    //     path: path.join(contactPath, contactFile),
                    //     id: id,
                    // })
                }
            }
        })
    })
    currentContactList = res;
    return res
}

const addContact = (id, name, inviteText) => {
    const filePath = path.join(getContactFolderForId(id), `${name}.incoming.bin`)
    let inviteBuffer = Buffer.from(inviteText, 'base64');
    fs.writeFileSync(filePath, inviteBuffer);
    currentContactList = null
    return filePath
}
const removeContact = (id, name) => {
    const filePath = path.join(getContactFolderForId(id), `${name}.incoming.bin`)
    if (isFileExists(filePath)) {
        fs.unlinkSync(filePath)
        currentContactList = null
        return true
    }
    return false
}

exports.getContactList = getContactList
exports.addContact = addContact
exports.removeContact = removeContact