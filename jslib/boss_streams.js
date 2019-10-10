/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

'use strict';

let _boss = require("boss.min");

module.exports = {
    Reader: _boss.reader,
    Writer: _boss.writer
};