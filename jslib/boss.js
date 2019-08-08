'use strict';

let _boss = require("boss.min");
let _bosscpp = require("bosscpp");

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
        return new Promise(resolve => __boss_asyncLoad(data, nestedLoadMap, (res) => {
            _bosscpp.updateObjectProto(res);
            resolve(res);
        }));
    },

    Reader: _boss.reader,
    Writer: _boss.writer,
};