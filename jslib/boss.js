'use strict';

let _boss = require("boss.min");

// init cpp prototype holders
__boss_addPrototype("HashId", crypto.HashId.prototype);
__boss_addPrototype("PublicKey", crypto.PublicKey.prototype);
__boss_addPrototype("PrivateKey", crypto.PrivateKey.prototype);

module.exports = {
    async dump(data) {
        //return new _boss().dump(data);
        return this.asyncDump(data);
    },

    async load(data) {
        //return new _boss().load(data);
        return this.asyncLoad(data);
    },

    asyncDump(data) {
        return new Promise(resolve => __boss_asyncDump(data, resolve));
    },

    asyncLoad(data, nestedLoadMap = null) {
        return new Promise(resolve => __boss_asyncLoad(data, nestedLoadMap, resolve));
    },

    Reader: _boss.reader,
    Writer: _boss.writer,
};