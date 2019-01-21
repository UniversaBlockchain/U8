class IoError extends Error {}

class AsyncProcessor  {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            [this.resolve, this.reject] = [resolve, reject]
        });
    }

    process(code, result) {
        console.log("inproc", code, result);
        if (code < 0)
            this.reject(new IoError(`${IoHandle.getErrorText(code)} (${code})`));
        else
            this.resolve(result);
    }

}

AsyncProcessor.prototype.call = function(code, result) { this.process(code, result)}

async function openRead(url) {
    let handle = new IoHandle();
    let ap = new AsyncProcessor()
    handle.open(url, 'r', 0, code => ap.process(code, handle));
    return ap.promise
}


module.exports = {openRead};