const Tools = require("tools");
const Config = require("config").Config;

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
    PRICE_CHECK_REFERENCED_VERSION : 1
};

function QuantiserException() {

}

function Quantiser() {
    this.quantaSum_ = 0;
    this.quantaLimit_ = -1;

}

Quantiser.quantaPerU = Config.quantiser_quantaPerU;

Quantiser.prototype.reset = function(limit) {
    this.quantaSum_ = 0;
    this.quantaLimit_ = limit;
};

Quantiser.prototype.addWorkCost = function(cost){
    this.quantaSum_ += cost;
    if (this.quantaLimit_ >= 0)
        if (this.quantaSum_ > this.quantaLimit_){
            throw new QuantiserException();
        }
};

Quantiser.prototype.addWorkCostFrom = function(quantiser){
    this.addWorkCost(quantiser.quantaSum_);
};


Quantiser.prototype.quantasLeft = function() {
    if (this.quantaLimit_ >= 0) {
        return this.quantaLimit_ - this.quantiser.quantaSum_;
    }
    return -1;
};

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {QuantiserProcesses,Quantiser,QuantiserException};