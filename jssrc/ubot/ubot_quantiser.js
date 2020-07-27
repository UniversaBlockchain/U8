/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const Config = require("config").Config;

const UBotQuantiserProcesses = {
    PRICE_START_CLOUD_METHOD: 50,
    PRICE_WORK_MINUTE: 100,
    PRICE_WAITING_MINUTE: 10,
    PRICE_HTTP_REQUEST: 2,
    PRICE_DNS_REQUEST: 2,
    PRICE_WRITE_MULTI_STORAGE: 40,
    PRICE_WRITE_SINGLE_STORAGE: 20,
    PRICE_GET_STORAGE: 4
};

class UBotQuantiserException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class UBotQuantiser {
    constructor() {
        this.quantaSum_ = 0;
        this.quantaLimit_ = -1;
    }

    reset(limit) {
        this.quantaSum_ = 0;
        this.quantaLimit_ = limit;
    }

    addWorkCost(cost) {
        this.quantaSum_ += cost;
        if (this.quantaLimit_ >= 0)
            if (this.quantaSum_ > this.quantaLimit_)
                throw new UBotQuantiserException("Quantiser limit is reached");
    }

    addWorkCostFrom(quantiser) {
        this.addWorkCost(quantiser.quantaSum_);
    }

    quantasLeft() {
        if (this.quantaLimit_ >= 0)
            return this.quantaLimit_ - this.quantaSum_;

        return -1;
    }

    static quantaPerU = Config.quantiser_quantaPerU;
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {UBotQuantiserProcesses, UBotQuantiser, UBotQuantiserException};