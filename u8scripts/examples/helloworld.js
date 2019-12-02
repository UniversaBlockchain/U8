/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// Launch as:
//   u8 helloworld.js
// or
//   u8 helloworld.js yourname
//
// See details at https://kb.universablockchain.com/u8_hello_world/221

async function main(args) {
    console.log(`Hello, ${(args.length > 0)? args[0] : 'world'}!`);
    return 0;
}
