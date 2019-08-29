/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

let bs = require("biserializable");
let dbm = require("defaultbimapper");


class BossBiMapper extends bs.BiMapper {
    constructor() {
        super();
    }

    static getInstance() {
        if(!BossBiMapper.instance) {
            BossBiMapper.instance = new BossBiMapper();

            let dbmAdapters = dbm.DefaultBiMapper.getInstance().adapters;
            for(let [key,value] of dbmAdapters) {
                if(value.getTag() === "binary")
                    continue;
                if(value.getTag() === "unixtime")
                    continue;
                BossBiMapper.instance.adapters.set(key,value);
            }

        }
        return BossBiMapper.instance;
    }
}


module.exports = {BossBiMapper};