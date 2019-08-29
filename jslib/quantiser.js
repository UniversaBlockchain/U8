/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const Tools = require("tools");
const Config = require("config").Config;
const Exception = require("exceptions").Exception;
///////////////////////////
//TransactionPack
///////////////////////////

const QuantiserProcesses = {
    PRICE_CHECK_2048_SIG : 1,
    PRICE_CHECK_4096_SIG : 8,
    PRICE_APPLICABLE_PERM :1,
    PRICE_SPLITJOIN_PERM : 2,
    PRICE_REGISTER_VERSION: 20,
    PRICE_REVOKE_VERSION: 20,
    PRICE_CHECK_CONSTRAINT : 1
};


class QuantiserException extends Error {
    constructor(message = undefined) {
        super()
    }
}

class Quantiser {
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
            if (this.quantaSum_ > this.quantaLimit_){
                throw new QuantiserException();
            }
    }

    addWorkCostFrom(quantiser) {
        this.addWorkCost(quantiser.quantaSum_);
    }

    quantasLeft() {
        if (this.quantaLimit_ >= 0) {
            return this.quantaLimit_ - this.quantaSum_;
        }
        return -1;
    }

    static quantaPerU = Config.quantiser_quantaPerU;
}



///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {QuantiserProcesses,Quantiser,QuantiserException};