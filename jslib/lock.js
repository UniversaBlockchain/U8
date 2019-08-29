/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const t = require("tools");

class Lock {

    constructor() {
        this.locks = new t.GenericMap();
    }

    async synchronize(obj, block) {
        let lock;
        while ((lock = this.locks.get(obj)) != null)
            await lock;

        let fire = null;
        this.locks.set(obj, new Promise((resolve) => {fire = resolve}));

        let res = null;
        try {
            res = await block();
        } catch (err) {
            this.locks.delete(obj);
            fire();

            throw err;
        }

        this.locks.delete(obj);
        fire();

        return res;
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Lock};