const ex = require("exceptions");

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length != b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (let i = 0; i < a.length; ++i) {
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
    if(this instanceof Map || this instanceof GenericMap) {
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
    if(this instanceof Set || this instanceof GenericSet) {
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

Object.prototype.stringId = function () {
    console.log("Error: stringId is not redefined for custom object " + this.constructor.name);
    throw new ex.IllegalArgumentError("Error: stringId is not redefined for custom object " + this.constructor.name);
};

Uint8Array.prototype.stringId = function () {
    if (this.stringId_ == null)
        this.stringId_ = btoa(this);

    return this.stringId_;
};

class GenericMap {

    constructor() {
        this.genKeys = new Map();
        this.genValues = new Map();
    }

    get(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        return this.genValues.get(k);
    }

    has(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        return this.genValues.has(k);
    }

    delete(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        this.genKeys.delete(k);
        return this.genValues.delete(k);
    }

    set(key, value) {
        let k = (typeof key === "object") ? key.stringId() : key;

        this.genKeys.set(k, key);
        return this.genValues.set(k, value);
    }

    clear() {
        this.genKeys.clear();
        this.genValues.clear();
    }

    keys() {
        return this.genKeys.values();
    }

    values() {
        return this.genValues.values();
    }

    entries() {
        return {
            next: function() {
                let k = this.genKeys.next();
                return { value: [k.value, this.genValues.next().value], done: k.done };
            },
            genKeys: this.keys(),
            genValues: this.values()
        };
    }

    [Symbol.iterator]() {
        return this.entries();
    }

    get size() {
        return this.genValues.size;
    }
}

class GenericSet {

    constructor(iterable = null) {
        this.genKeys = new Map();

        if (iterable != null)
            for (let i of iterable)
                this.genKeys.set((typeof i === "object") ? i.stringId() : i, i);
    }

    add(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        this.genKeys.set(k, x);

        return this;
    }

    has(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        return this.genKeys.has(k);
    }

    delete(x) {
        let k = (typeof x === "object") ? x.stringId() : x;

        return this.genKeys.delete(k);
    }

    clear() {
        this.genKeys.clear();
    }

    get size() {
        return this.genKeys.size;
    }

    forEach(callback) {
        for (let v of this.genKeys.values())
            callback(v);
    }

    [Symbol.iterator]() {
        return this.genKeys.values();
    }
}

Date.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(this.prototype !== to.prototype )
        return false;

    return this.getTime() === to.getTime();
};

/*let addFunc = Set.prototype.add;
let deleteFunc = Set.prototype.delete;

Set.prototype.has = function(value) {
    for(let k of this) {
        if(valuesEqual(value,k))
            return true;
    }
    return false;
};

Set.prototype.add = function(value) {
    if(!this.has(value))
        return addFunc.call(this,value);

    return this;
};

Set.prototype.delete = function (value) {
    let found = null;
    for (let k of this) {
        if (valuesEqual(value,k)) {
            found = k;
            break;
        }
    }

    if (found != null)
        return deleteFunc.call(this, found);

    return false;
};*/

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
    } else if (data === "now()") {
        let res = new Date();
        res.setMilliseconds(0);
        return res;
    } else
        throw "can't convert " + JSON.stringify(data) + " to Date";
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

function getOrThrow(obj, key) {
    if (obj.hasOwnProperty(key))
        return obj[key];

    throw new Error("can't get " + key);
}

/**
 * Adds two maps to enum: byVal and byOrdinal. See UBotPoolState for example.
 * Also, adds .val text values.
 * @param target enum
 */
function addValAndOrdinalMaps(en) {
    let byOrdinal = new Map();
    for (let k in en) {
        if (en.hasOwnProperty(k)) {
            en[k].val = k;
            byOrdinal.set(en[k].ordinal, en[k]);
        }
    }
    en.byOrdinal = byOrdinal;
    en.byVal = {};
    en.byVal.get = function (key) {return en[key]};
}

function randomChoice(list, count, safe = true) {
    if (safe)
        list = [...list];
    if (count > list.length)
        throw new ex.IllegalArgumentError("randomChoice error: count > arr.length");
    let res = [];
    while (res.length < count) {
        let pick = Math.floor(Math.random()*list.length);
        res.push(list[pick]);
        list.splice(pick, 1);
    }
    return res;
}

class RateCounter {
    constructor(name) {
        this.name = name;
        this.t0 = new Date().getTime();
        this.counter0 = 0;
        this.counter = 0;
    }

    inc() {
        ++this.counter;
    }

    show() {
        let now = new Date().getTime();
        let rate = (this.counter - this.counter0) * 1000 / (now - this.t0);
        this.t0 = now;
        this.counter0 = this.counter;
        console.log(this.name + " rate: " + rate.toFixed(0) + " per sec,\tcounter: " + this.counter);
    }
}

module.exports = {arraysEqual, valuesEqual, randomString, MemoiseMixin, PackedEqMixin, DigestEqMixin, GenericMap, GenericSet,
    equals, THROW_EXCEPTIONS, convertToDate, randomBytes, getOrDefault, getOrThrow, addValAndOrdinalMaps, randomChoice,
    RateCounter};