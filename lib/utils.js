const fs = require('fs')

const isFilePath = (path) => {
    try {
        if (fs.existsSync(path)) {
            return true
        }
    } catch { }
    return false
}

exports.isFilePath = isFilePath