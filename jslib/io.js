/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/**
 * Carries errors from I/O subsystem. When possible, provides #code property.
 */
class IoError extends Error {
    constructor(reason) {
        let code = +reason;
        if (code != reason) {
            super(reason);
            this.code = undefined;
        } else {
            super(`${IOFile.getErrorText(code)} (${code})`);
            this.code = reason;
        }
    }
}

class AsyncProcessor {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            [this.resolve, this.reject] = [resolve, reject]
        });
    }

    process(code, result) {
        if (code < 0)
            this.reject(new IoError(code));
        else
            this.resolve(result);
    }
}


/**
 * Default buffer size for hight level IO operation (e.g. Input and Output
 *
 * @type {number}
 */
const chunkSize = 2048;

const file_proto = IOFile.prototype;
const tcp_proto = IOTCP.prototype;
const tls_proto = IOTLS.prototype;
const udp_proto = IOUDP.prototype;

file_proto.read = tcp_proto.read = tls_proto.read =function (size) {
    if (size <= 0)
        throw Error("size must > 0");
    let ap = new AsyncProcessor();
    this._read_raw(size, (data, code) => {
        // read less than expected: slice
        if( code > 0 && code < size )
            data = data.slice(0, code);
        ap.process(code, data)
    });
    return ap.promise;
};

file_proto.write = tcp_proto.write = tls_proto.write =function (data) {
    if (!(data instanceof Uint8Array)) {
        data = Uint8Array.from(data);
    }
    let ap = new AsyncProcessor();
    this._write_raw(data, code => ap.process(code));
    return ap.promise;
};

file_proto.close = tcp_proto.close = tls_proto.close = udp_proto.close = function() {
    let ap = new AsyncProcessor();
    this._close_raw(code => ap.process(code));
    return ap.promise;
};

/**
 * The InputStream allows effectively read text and binary data from handle-like
 * object providing only async read(size) function.
 *
 * @param handle object capable to async read(size) up to size bytes.  must retunr undefined on end of stream.
 * @param buferLength buffer size to use with this input.
 * @returns {InputStream}
 * @constructor
 */
function InputStream(handle, buferLength = chunkSize) {

    let chunk = undefined;
    let pos = 0;

    async function loadChunk() {
        chunk = await handle.read(chunkSize);
        if (!chunk) {
            pos = -1;
            return undefined;
        } else
            pos = 0;
        return chunk;
    }

    /**
     * read_some() function reads from 0 to chunkSize bytes.
     * Consider using read() function if you need to ensure that the requested amount of data is read.
     */
    this.read_some = loadChunk;

    /**
     * Get next byte, ir undefined if end of stream is reached.
     *
     * @returns {Promise<number | undefined>}
     */
    async function nextByte() {
        if (pos < 0)
            return undefined;
        if (!chunk || pos >= chunk.length) {
            if (!await loadChunk())
                return undefined; // EOF
        }
        return chunk[pos++];
    }

    /**
     * Read the line from the current point to the nearest line end.
     *
     * @returns {Promise<string | undefined>} resulves to the string ir undefined if end of stream is reached
     */
    async function nextLine() {
        let line = [];
        while (true) {
            let b = await nextByte();
            if (!b) {
                if (line.length > 0)
                    return utf8Decode(Uint8Array.from(line));
                else
                    return undefined;
            }
            if (b === 0x0A) {
                return utf8Decode(Uint8Array.from(line));
                line = []
            } else {
                line.push(b);
            }
        }
    }

    this.nextByte = nextByte;
    this.nextLine = nextLine;
    this.readLine = nextLine;
    this.readByte = nextByte;

    /***
     * Async iterator for remainig bytes. Iterate bytes as numbers.
     *
     * @type {{[Symbol.asyncIterator]: Function}}
     */
    this.bytes = {
        [Symbol.asyncIterator]: async function* () {
            while (true) {
                let b = await nextByte();
                if (b) yield b;
                else break;
            }
        }
    };

    /***
     * Async iterator for remaining lines of the input. Iteration start from the cirrent position in the input
     *
     * @type {{[Symbol.asyncIterator]: Function}}
     */
    this.lines = {
        [Symbol.asyncIterator]: async function* () {
            let line;
            while (true) {
                let line = await nextLine();
                if (line) yield line;
                else return;
            }
        }
    };

    /**
     * read the rest of the input as typed array of bytes.
     *
     * @returns {Promise<Uint8Array>}
     */
    this.allBytes = async function () {
        let parts = [];

        if (pos >= 0) {
            // if some chunk already load, used unread part of it
            if (chunk)
                parts.push(pos > 0 ? chunk.subarray(pos) : chunk);

            // load the rest
            while (await loadChunk())
                parts.push(chunk);
        }
        let size = parts.reduce((a, b) => a + b.length, 0);
        let result = new Uint8Array(size);
        let offset = 0;

        parts.forEach(x => {
            result.set(x, offset);
            offset += x.length;
        });
        return result;
    };

    /**
     * Read the rest of the stream as bytes. Same as {#allBytes()}
     * @type {(function(): Uint8Array)}
     */
    this.readAll = this.allBytes;

    /**
     * Read up to specified number of bytes or until the end of the stream.
     *
     * @param size
     * @returns {Promise<Uint8Array>} the array could be shorter or empty
     */
    this.read = async function (size) {
        let result = new Uint8Array(size);
        let actualSize = 0;

        function push(part) {
            result.set(part, actualSize);
            actualSize += part.length;
        }

        if (pos >= 0) {
            if (chunk) {
                push(chunk.subarray(pos, size + pos));
                pos += size;
            }
            while (actualSize < size) {
                if (!await loadChunk())
                    break;
                if (chunk.length + actualSize <= size) {
                    push(chunk)
                    pos = chunk.length;
                }
                else {
                    let left = size - actualSize;
                    // left first bytes of the chunk to copy
                    push(chunk.subarray(0, left));
                    pos += left;
                }
            }
        }
        // console.log(`read outcome: chunk: ${chunk.length}: ${utf8Decode(chunk)}, pos: ${pos}, result: ${utf8Decode(result)}`);
        return result.slice(0, actualSize);
    };

    /**
     * read the rest of the input as utf8 string.
     *
     * @returns {Promise<string>}
     */
    this.allAsString = async function () {
        return utf8Decode(await this.allBytes());
    };

    /**
     * Read the rest of the stream as a UTF8 string.
     * @type {(function(): String)}
     */
    this.readAllAsString = this.allAsString;

    this.close = async function() { return handle.close() };

    return this;
}

const reSkipFile = /^file:\/(?:\/\/)?([^/].*)$/;

/**
 * Open some resource (as for now, the file) for read.
 * @param url to open. local file name could omit "file://" prefix
 * @param bufferLength
 * @returns {Promise<any>}
 */
async function openRead(url, {bufferLength = chunkSize}={}) {
    // normalize name: remove file:/ and file:/// protocols
    let match = reSkipFile.exec(url);
    if (match)
        url = match[1];
    // todo: more protcols
    let handle = new IOFile();
    let ap = new AsyncProcessor();
    handle.open(url, 'r', 0, code => ap.process(code, new InputStream(handle, bufferLength)));
    return ap.promise
}

function OutputStream(handle, bufferSize = chunkSize) {
    this.write = async function (data) {
        if( typeof(data) == 'string')
            data = utf8Encode(data);
        await handle.write(data);
    };

    this.close = async function() { return handle.close() };
}

async function openWrite(url, mode = "w", {bufferLength = chunkSize, umask = 0o644}={}) {
    switch (mode) {
        case 'w': case 'a':
            break;
        case "wb":
            mode = "w";
            break;
        default:
            throw Error("unknown write mode " + mode);
    }
    // normalize name: remove file:/ and file:/// protocols
    let match = reSkipFile.exec(url);
    if (match)
        url = match[1];
    // todo: more protcols
    let handle = new IOFile();
    let ap = new AsyncProcessor();
    handle.open(url, mode, umask, code => ap.process(code, new OutputStream(handle, bufferLength)));
    return ap.promise
}

async function stat(url) {
    // normalize name: remove file:/ and file:/// protocols
    let match = reSkipFile.exec(url);
    if (match)
        url = match[1];
    // todo: more protcols
    let ap = new AsyncProcessor();
    IOFile.stat_mode(url, (mode, code) => ap.process(code, mode));
    return ap.promise;
}

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

async function isAccessible(url) {
    try {
        await stat(url);
    } catch (err) {
        return false;
    }

    return true;
}

async function isFile(url) {
    return Boolean(await stat(url) & S_IFREG);
}

async function isDir(url) {
    return Boolean(await stat(url) & S_IFDIR);
}

async function openDir(url) {
    // normalize name: remove file:/ and file:/// protocols
    let match = reSkipFile.exec(url);
    if (match)
        url = match[1];
    // todo: more protcols
    let handle = new IODir();
    let ap = new AsyncProcessor();
    handle.open(url, code => ap.process(code, handle));
    return ap.promise;
}

const EntryType = {
    fileEntry: 0,
    dirEntry: 1
};

async function getEntriesFromDir(url) {
    let handle = await openDir(url);

    let result = [];
    let entry = handle.next();
    while (entry) {
        result.push(entry);
        entry = handle.next();
    }

    return result;
}

async function getFilesFromDir(url) {
    let handle = await openDir(url);

    let result = [];
    let entry = handle.next();
    while (entry) {
        if (entry[1] === EntryType.fileEntry)
            result.push(entry[0]);
        entry = handle.next();
    }

    return result;
}

function getTmpDirPath() {
    //TODO: bind some cross platform function here
    return "/tmp";
}

/**
 * New dir with rwxr-xr-x permissions.
 */
function createDir(path) {
    let ap = new AsyncProcessor();
    IODir.create(path, code => {
        // 'already exists' is ok
        if (code == -17)
            code = 0;
        ap.process(code, true);
    });
    return ap.promise;
}

/**
 * Removes all contents recursively.
 */
async function removeDir(path) {
    let ents = [];
    try {ents = await getEntriesFromDir(path);} catch (e) {/*do nothing*/}
    for (let e of ents) {
        if (e[1] === EntryType.fileEntry) {
            let ap = new AsyncProcessor();
            IOFile.remove(path + "/" + e[0], code => ap.process(code, true));
            await ap.promise;
        } else {
            await removeDir(path + "/" + e[0]);
        }
    }
    return removeEmptyDir(path);
}

function removeEmptyDir(path) {
    let ap = new AsyncProcessor();
    IODir.remove(path, code => {
        // 'no such file or directory' is ok
        if (code == -2)
            code = 0;
        ap.process(code, true);
    });
    return ap.promise;
}

async function filePutContents(path, contents) {
    let h = await openWrite(path);
    await h.write(contents);
    await h.close();
}

async function fileGetContentsAsString(path) {
    let h = await openRead(path);
    let res = await h.allAsString();
    await h.close();
    return res;
}

async function fileGetContentsAsBytes(path) {
    let h = await openRead(path);
    let res = await h.allBytes();
    await h.close();
    return res;
}

// For u8 core module resources (files in module)
const U8MODULE_EXTENSION = ".u8m/";

async function getResourcesFromPath(path) {
    let basePath = getBasePath();
    let fullPath = basePath + path;
    if (~basePath.indexOf(U8MODULE_EXTENSION))
        return await getModuleResourcesFromPath(fullPath);
    else
        return await getFilesFromDir(fullPath);
}

async function resourceGetContentsAsString(path) {
    let basePath = getBasePath();
    let fullPath = basePath + path;
    if (~basePath.indexOf(U8MODULE_EXTENSION))
        return await readResourceContentsAsString(fullPath);
    else
        return await fileGetContentsAsString(fullPath);
}

module.exports = {openRead, openWrite, InputStream, OutputStream, AsyncProcessor, IoError, isAccessible, isFile, isDir,
    EntryType, getEntriesFromDir, getFilesFromDir, getTmpDirPath, createDir, removeDir, filePutContents,
    fileGetContentsAsString, fileGetContentsAsBytes, getResourcesFromPath, resourceGetContentsAsString};
