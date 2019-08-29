/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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

class CommandFailedError extends Error {
    constructor(error = undefined, message = undefined) {
        super();
        if (error !== undefined)
            this.error = error;
        if (message !== undefined)
            this.message = message;
    }
}

module.exports = {IllegalStateError, IllegalArgumentError, CommandFailedError}