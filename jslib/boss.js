'use strict';

let _boss = require("boss.min");

let isCppProrotypesInitialized = false;

module.exports = {
    dump(data) {
        return new _boss().dump(data);
    },

    load(data) {
        return new _boss().load(data);
    },

    asyncDump(data) {
        return new Promise(resolve => __boss_asyncDump(data, resolve));
    },

    asyncLoad(data, nestedLoadMap = null) {
        if (!isCppProrotypesInitialized) {
            __boss_addPrototype("HashId", crypto.HashId.prototype);
            __boss_addPrototype("PublicKey", crypto.PublicKey.prototype);
            __boss_addPrototype("PrivateKey", crypto.PrivateKey.prototype);
            isCppProrotypesInitialized = true;
        }
        return new Promise(resolve => __boss_asyncLoad(data, nestedLoadMap, resolve));
    },

    Reader: _boss.reader,
    Writer: _boss.writer,
};