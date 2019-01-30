let bs = require("biserializable");


function DefaultBiMapper() {
    bs.BiMapper.call(this);
}

DefaultBiMapper.prototype = Object.create(bs.BiMapper.prototype);

DefaultBiMapper.getInstance = function () {
    if(!this.instance)
        this.instance = new DefaultBiMapper();
    return this.instance;
};

DefaultBiMapper.registerAdapter = function (adapter) {
    this.getInstance().registerAdapter(adapter);
};

DefaultBiMapper.removeAdapter = function (adapter) {
    this.getInstance().removeAdapter(adapter);
};

DefaultBiMapper.removeAdapterForType = function (type) {
    this.getInstance().removeAdapterForType(type);
};

DefaultBiMapper.removeAdapterForTag = function (tag) {
    this.getInstance().removeAdapterForTag(tag);
};


let binaryAdapter = new bs.BiAdapter("binary",Uint8Array);
binaryAdapter.serialize = function(o,s) {

};

binaryAdapter.deserialize = function(data,d) {

};

DefaultBiMapper.registerAdapter(binaryAdapter);

let datetimeAdapter = new bs.BiAdapter("unixtime",Date);
datetimeAdapter.serialize = function(o,s) {
    return {
        seconds : Math.floor(o.getTime()/1000)
    };
};

datetimeAdapter.deserialize = function(data,d) {
    let res = new Date();
    res.setTime(data.seconds*1000);
    return res;
};

DefaultBiMapper.registerAdapter(datetimeAdapter);


module.exports = {DefaultBiMapper};