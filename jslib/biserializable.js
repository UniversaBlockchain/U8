function BiSerializable() {
    
}

BiSerializable.prototype.deserialize = function (data, deserializer) {
    return null;
};

BiSerializable.prototype.serialize = function (data, serializer) {
    return { __type:null};
};


function BiAdapter(tag,type) {
    this.tag = tag;
    this.type = type;
}

BiAdapter.prototype.deserialize = function (data,deserializer) {
    let o = new this.type();
    o.deserialize(data,deserializer);
    return o;
};


BiAdapter.prototype.serialize = function (object,serializer) {
    return object.serialize(serializer);
};

BiAdapter.prototype.getTag = function () {
    return this.tag;
};

BiAdapter.prototype.getType = function () {
    return this.type.prototype;
};



function BiMapper() {
    this.adapters = new Map();
}

BiMapper.prototype.deserialize = function (data) {
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

BiMapper.prototype.serialize = function (object) {
    const proto = Object.getPrototypeOf(object);

    if(this.adapters.has(proto)) {
        const adapter = this.adapters.get(proto);
        let result = adapter.serialize(object,this);
        result.__type = adapter.getTag();
        return result;
    } else if(proto == Object.prototype) {
        let result = {};
        for(let key of Object.keys(object)) {
            result[key] = this.serialize(object[key],this);
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

BiMapper.prototype.removeAdapter = function (adapter) {
    this.adapters.delete(adapter.getTag());
    this.adapters.delete(adapter.getType());

};

BiMapper.prototype.removeAdapterForType = function (type) {
    if(this.adapters.has(type)) {
        this.removeAdapter(this.adapters.get(type));
    }
};

BiMapper.prototype.removeAdapterForTag = function (tag) {
    if(this.adapters.has(tag)) {
        this.removeAdapter(this.adapters.get(tag));
    }
};

BiMapper.prototype.registerAdapter = function (adapter) {
    this.adapters.set(adapter.getTag(),adapter);
    this.adapters.set(adapter.getType(),adapter);
};


module.exports = {BiSerializable,BiAdapter,BiMapper};