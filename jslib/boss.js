'use strict';

let _boss = require("boss.min");

module.exports = {
    dump(data) {
        return new _boss().dump(data);
    },

    load(data) {
        return new _boss().load(data);
    },

    Reader: _boss.reader,
    Writer: _boss.writer,
};