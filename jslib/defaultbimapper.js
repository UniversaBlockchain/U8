let bs = require("biserializable");


function DefaultBiMapper() {
    this.adapters = new Map();
}

DefaultBiMapper.prototype.deserialize = function (data) {
    if(Object.getPrototypeOf(data) === Object.prototype) {
        if(data.hasOwnProperty("__type")) {
            if(this.adapters.has(data.__type)) {
                let adapter = this.adapters.get(data.__type);
                return adapter.deserialize(data,this);
            }
        }

        let result = {};
        for(let key of Object.keys(data)) {
            result[key] = this.deserialize(data[key]);
        }
        return result;

    } else if(data instanceof Array) {
        let result = new Array();
        for(let element of data) {
            result.push(this.deserialize(element));
        }
        return result;
    } else {
        return data;
    }
};

DefaultBiMapper.prototype.serialize = function (object) {
    const proto = Object.getPrototypeOf(object);

    if(this.adapters.has(proto)) {
        const adapter = this.adapters.get(proto);
        let result = adapter.serialize(object,this);
        result.__type = adapter.getTag();
        return result;
    } else if(proto == Object.prototype) {
        let result = {};
        for(let key of Object.keys(object)) {
            result[key] = this.serialize(data[key],this);
        }
        return result;
    } else if(object instanceof Array) {
        let result = [];
        for(let element of object) {
            result.push(this.serialize(element));
        }
        return result;
    } else if(object instanceof Set) {
        let result = [];
        for(let element of object) {
            result.push(this.serialize(element));
        }
        return result;
    } else {
        return object;
    }
};

DefaultBiMapper.getInstance = function () {
    if(!this.instance)
        this.instance = new DefaultBiMapper();
    return this.instance;
};

DefaultBiMapper.registerAdapter = function (adapter) {
    this.getInstance().adapters.set(adapter.getTag(),adapter);
    this.getInstance().adapters.set(adapter.getType(),adapter);
};

DefaultBiMapper.removeAdapter = function (adapter) {
    this.getInstance().adapters.delete(adapter.getTag());
    this.getInstance().adapters.delete(adapter.getType());
};


module.exports = {DefaultBiMapper};