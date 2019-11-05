/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

class UBotClientException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class UBotProcessException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

module.exports = {UBotClientException, UBotProcessException};