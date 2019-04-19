
function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length != b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function valuesEqual(x,y) {
    if (x === y) return true;
    if (x == null || y == null) return false;
    if(x instanceof Object) {
        if(y instanceof  Object) {
            if(x.constructor.name !== y.constructor.name)
                return false;
            return x.equals(y);
        } else {
            return false;
        }
    }
    return false;

}

Object.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    //Object aka Map
    if(Object.getPrototypeOf(this) === Object.prototype) {
        if(Object.keys(this).size !== Object.keys(to).size) {
            return false;
        }

        for(let key of Object.keys(this)) {

            if(!to.hasOwnProperty(key))
                return false;

            if(!valuesEqual(this[key],to[key]))
                return false;
        }

        return true;
    }

    if(typeof this === "string") {
        return this === to;
    }

    if(typeof this === "number") {
        return this === to;
    }

    //Map
    if(this instanceof Map) {
        if(this.size !== to.size) {
            return false;
        }

        for (let [key1, value1] of this) {
            let found = false;
            for (let [key2, value2] of to) {
                if(valuesEqual(key1,key2)) {
                    found = true;
                    if(!valuesEqual(value1,value2)) {
                        return false;
                    }
                    break;
                }
            }
            if(!found)
                return false
        }
        return true;
    }

    if(this instanceof  Uint8Array) {
        if(this.length !== to.length) {
            return false;
        }
        for (let i = 0; i < this.length; ++i) {
            if (this[i] !== to[i]) return false;
        }
        return true;
    }

    //Array
    if(this instanceof Array) {
        if(this.length !== to.length) {
            return false;
        }
        for (let i = 0; i < this.length; ++i) {
            if (!valuesEqual(this[i],to[i])) return false;
        }
        return true;
    }

    //Set
    if(this instanceof Set) {
        if(this.size !== to.size) {
            return false;
        }

        for(let x1 of this) {
            let found = false;
            for(let x2 of to) {
                if(valuesEqual(x1,x2)) {
                    found = true;
                    break;
                }
            }
            if(!found)
                return false;
        }
        return true;

    }

    console.log("Error: equals is not redefined for custom object " + JSON.stringify(this));
    throw new ex.IllegalArgumentError("Error: equals is not redefined for custom object "); //+ JSON.stringify(this);
};


class GenericMap extends Map {
    get(x) {
        for(let k of this.keys()) {
            if(valuesEqual(k,x)) {
                return super.get(k);
            }
        }
        return null;
    }
}


let addFunc = Set.prototype.add;
let deleteFunc = Set.prototype.delete;


Date.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(this.prototype !== to.prototype )
        return false;

    return this.getTime() === to.getTime();
}

Set.prototype.has = function(value) {
    for(let k of this) {
        if(valuesEqual(value,k))
            return true;
    }
    return false;
};

Set.prototype.add = function(value) {
    if(!this.has(value))
        addFunc.call(this,value);
};

Set.prototype.delete = function (value) {
    let found = null;
    for(let k of this) {
        if(valuesEqual(value,k)) {
            found = k;
            break;
        }
    }
    if(found != null) {
        deleteFunc.call(this,found);
    }

};

function randomString(length) {
    let string = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < length; i++)
        string += possible.charAt(Math.floor(Math.random() * possible.length));

    return string;
}

const MemoiseMixin = {
    memoise(name, calculate) {
        if (!this[name]) this[name] = calculate();
        return this[name];
    }
};

const PackedEqMixin = {
    equals(to) {
        if(this === to)
            return true;

        if(this.prototype !== to.prototype )
            return false;

        return arraysEqual(this.packed, to.packed);
    }
};

const DigestEqMixin = {
    equals(to) {
        if(this === to)
            return true;

        if(this.prototype !== to.prototype )
            return false;

        return arraysEqual(this.digest, to.digest);
    }
};

const THROW_EXCEPTIONS = true;

function convertToDate(data) {
    if (data == null)
        return null;
    else if (data instanceof Date)
        return data;
    else if (typeof data === "number") {
        let res = new Date();
        res.setTime(data * 1000);
        return res;
    } else if (typeof data === "bigint") {
        let res = new Date();
        res.setTime(Number(data) * 1000);
        return res;
    } else if ((data.hasOwnProperty("__type") ||
        data.hasOwnProperty("__t")) &&
        data.hasOwnProperty("seconds")) {
        let res = new Date();
        res.setTime(data.seconds * 1000);
        return res;
    } else if (data === "now()")
        return new Date();
    else
        throw "can't convert " + JSON.stringify(data) + "to Date";
}

function randomBytes(count) {
    var result  = new Uint8Array(count);
    for(var i = 0;  i < count; ++i) {
        result[i] = Math.floor(Math.random() * 256);
    }
    return result;
}

function getOrDefault(obj, key, def) {
    if (obj.hasOwnProperty(key))
        return obj[key];

    return def;
}

module.exports = {arraysEqual, valuesEqual, randomString, MemoiseMixin, PackedEqMixin, DigestEqMixin, GenericMap, equals,
    THROW_EXCEPTIONS, convertToDate, randomBytes, getOrDefault};