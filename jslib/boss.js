'use strict';

let _boss = require("boss.min");
let _bosscpp = require("bosscpp");

module.exports = {
    async dump(data) {
        return new _boss().dump(data);
    },

    load(data) {
        return new _boss().load(data);
    },

    asyncLoad(data) {
        return new Promise(resolve => __boss_asyncLoad(data, (res) => {
            _bosscpp.updateObjectProto(res);
            resolve(res);
        }));
    },

    Reader: _boss.reader,
    Writer: _boss.writer,
};