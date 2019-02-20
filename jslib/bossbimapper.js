let bs = require("biserializable");
let dbm = require("defaultbimapper");


function BossBiMapper() {
    bs.BiMapper.call(this);
}

BossBiMapper.prototype = Object.create(bs.BiMapper.prototype);

BossBiMapper.getInstance = function () {
    if(!BossBiMapper.instance) {
        BossBiMapper.instance = new BossBiMapper();

        let dbmAdapters = dbm.DefaultBiMapper.getInstance().adapters;
        for(let [key,value] of dbmAdapters) {
            if(value.getTag() === "binary")
                continue;
            if(value.getTag() === "unixtime")
                continue;
            BossBiMapper.instance.adapters.set(key,value);
        }

    }
    return BossBiMapper.instance;
};


module.exports = {BossBiMapper};