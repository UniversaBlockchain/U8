/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// this is just a test file tu run with u8

let io = require("io");
let Contract = require("contract").Contract;
let TransactionPack = require("transactionpack").TransactionPack;


async function main(args) {


    let input = await io.openRead(args[0]);
    let sealed = await input.allBytes();
    await input.close();

    let contract = await TransactionPack.unpack(sealed).contract;
    await contract.check();
    console.log(JSON.stringify({ errors: contract.errors, cost: contract.quantiser.quantaSum_, costU: contract.getProcessedCostU()}));

}

