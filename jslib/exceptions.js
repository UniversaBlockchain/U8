
class IllegalStateError extends Error {
    constructor(message = undefined) {
        super();
        if (message !== undefined)
            this.message = message;
    }
}

class IllegalArgumentError extends Error {
    constructor(message = undefined) {
        super();
        if (message !== undefined)
            this.message = message;
    }
}

module.exports = {IllegalStateError,IllegalArgumentError}