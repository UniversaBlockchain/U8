class BiSerializable {
    constructor() {

    }

    deserialize(data, deserializer) {
        return null;
    }

    serialize(data, serializer) {
        return { __type:null};
    }
}


class BiAdapter {
    constructor(tag, type) {
        this.tag = tag;
        this.type = type;
    }

    deserialize(data, deserializer) {
        let o = new this.type();
        o.deserialize(data,deserializer);
        return o;
    }

    serialize(object, serializer) {
        return object.serialize(serializer);
    }

    getTag() {
        return this.tag;
    }

    getType() {
        return this.type.prototype;
    }
}


class BiMapper {
    constructor() {
        this.adapters = new Map();
    }

    deserialize(data) {
        if(data == null || typeof data === "undefined")
            return null;

        if(Object.getPrototypeOf(data) === Object.prototype) {
            let type;
            if (data.hasOwnProperty("__type") && this.adapters.has(data.__type))
                type = data.__type;
            if (data.hasOwnProperty("__t") && this.adapters.has(data.__t))
                type = data.__t;

            if (type !== undefined) {
    //          console.log(JSON.stringify(data));
                let adapter = this.adapters.get(type);
                return adapter.deserialize(data, this);
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
    }

    serialize(object) {
        if(object == null || typeof object === "undefined")
            return null;
        const proto = Object.getPrototypeOf(object);

        if(this.adapters.has(proto)) {
            const adapter = this.adapters.get(proto);
            let result = adapter.serialize(object,this);
            result.__type = adapter.getTag();
            return result;
        } else if(proto === Object.prototype) {
            let result = {};
            for(let key of Object.keys(object)) {
                result[key] = this.serialize(object[key]);
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
    }

    removeAdapter(adapter) {
        this.adapters.delete(adapter.getTag());
        this.adapters.delete(adapter.getType());

    }

    removeAdapterForType(type) {
        if(this.adapters.has(type)) {
            this.removeAdapter(this.adapters.get(type));
        }
    }

    removeAdapterForTag(tag) {
        if(this.adapters.has(tag)) {
            this.removeAdapter(this.adapters.get(tag));
        }
    }

    registerAdapter(adapter) {
        this.adapters.set(adapter.getTag(),adapter);
        this.adapters.set(adapter.getType(),adapter);
    }
}


module.exports = {BiSerializable,BiAdapter,BiMapper};