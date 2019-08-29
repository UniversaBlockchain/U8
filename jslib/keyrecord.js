/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

let bs = require("biserializable");
let dbm = require("defaultbimapper");
let t = require("tools");
const ex = require("exceptions");

///////////////////////////
//KeyRecord
///////////////////////////

class KeyRecord extends bs.BiSerializable {
    constructor(key) {
        super();
        this.key = key;
    }

    setupKey() {
        try {
            if (this.key instanceof crypto.PublicKey)
                return;
            else if (this.key instanceof crypto.PrivateKey)
                this.key = this.key.publicKey;
            else if (typeof this.key === "string")
                this.key = new crypto.PublicKey(atob(this.key.replace(/\s/g, "")));
            else {
                if (this.key instanceof Array)
                    this.key = new crypto.PublicKey(this.key);
                else
                    throw new ex.IllegalArgumentError("unsupported key object: " + JSON.stringify(this.key));
            }
        } catch (e) {
            throw new ex.IllegalArgumentError("unsupported key, failed to construct", e);
        }
    }

    async deserialize(data, deserializer) {
        this.key = await deserializer.deserialize(data.key);
    }

    async serialize(serializer) {
        return {key: await serializer.serialize(this.key)};
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        return t.valuesEqual(this.key,to.key);
    }

    static fromDsl(serializedKeyRecord) {
        if(!serializedKeyRecord.hasOwnProperty("key"))
            throw new ex.IllegalArgumentError("Undefined key required for init KeyRecord");

        let result = new KeyRecord(serializedKeyRecord.key);

        for (let field in serializedKeyRecord)
            if (serializedKeyRecord.hasOwnProperty(field))
                result[field] = serializedKeyRecord[field];

        result.setupKey();

        return result;
    }
}


dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("KeyRecord",KeyRecord));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {KeyRecord};