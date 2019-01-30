let bs = require("biserializable");
let dbm = require("defaultbimapper");


function BossBiMapper() {
    bs.BiMapper.call(this);
}

BossBiMapper.prototype = Object.create(bs.BiMapper.prototype);

BossBiMapper.getInstance = function () {
    if(!this.instance) {
        this.instance = new BossBiMapper();

        let dbmAdapters = dbm.DefaultBiMapper.getInstance().adapters;
        for(let [key,value] of dbmAdapters) {
            this.instance.adapters.set(key,value);
        }

        this.instance.removeAdapterForTag("binary");
        this.instance.removeAdapterForTag("unixtime");
    }
    return this.instance;
};


module.exports = {BossBiMapper};