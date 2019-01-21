/**
 * Carries errors from I/O subsystem. When possible, provides #code property.
 */
class IoError extends Error {
    constructor(reason) {
        if( reason instanceof String ) {
            super(reason);
            this.code = undefined;
        }
        else {
            super(`${IoHandle.getErrorText(reason)} (${reason})`);
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

const hproto = IoHandle.prototype;

const chunkSize = 8912;

hproto.read = function (size) {
    if (size <= 0)
        throw Error("size must > 0");
    let ap = new AsyncProcessor();
    this._read_raw(size, (data, code) => ap.process(code, data));
    return ap.promise;
};

function Reader(handle) {

    let chunk = undefined;
    let pos = 0;

    async function nextByte() {
        if (pos < 0)
            return undefined;
        if (!chunk || pos >= chunk.length) {
            chunk = await handle.read(chunkSize);
            if (!chunk) {
                pos = -1;
                return undefined;
            } else {
                pos = 0;
            }
        }
        return chunk[pos++];
    }

    this.bytes = async function* () {
        while (true) {
            let b = await nextByte();
            if (b) yield b;
            else break;
        }
    };

    this.lines = async function* () {
        let line = [];
        while(true) {
            let b = await nextByte();
            if( !b ) {
                if( line.length > 0 )
                    yield utf8Decode(Uint8Array.from(line));
                return;
            }
            if( b === 0x0A ) {
                yield utf8Decode(Uint8Array.from(line));
                line = []
            } else {
                line.push(b);
            }
        }
    };

    return this;
}

Object.defineProperty(hproto, "reader", {
    get: function () {
        if( !this.__reader ) this.__reader= new Reader(this);
        return this.__reader;
    }
});

Object.defineProperty(hproto, "lines", {
    get: function () {
        return this.reader.lines();
    }
});

Object.defineProperty(hproto, "bytes", {
    get: function () {
        return this.reader.bytes();
    }
});

AsyncProcessor.prototype.call = function (code, result) {
    this.process(code, result)
};

async function openRead(url) {
    let handle = new IoHandle();
    let ap = new AsyncProcessor();
    handle.open(url, 'r', 0, code => ap.process(code, handle));
    return ap.promise
}

module.exports = {openRead};