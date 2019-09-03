/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// async function main() {
//     console.log("Welcome!");
//     await sleep(500);
//     console.log("Done!");
//     return 202;
// }
async function main() {
    try {
        await sleep(500);
        console.log("Welcome!");
        __debug_throw(0, "te1");
        console.log("Done!");
    }
    catch(e) {
        console.log("we caught: "+e);
    }
    return 101;
}
// function main() {
//     try {
//         console.log("Welcome!");
//         __debug_throw(0, "te1");
//         console.log("Done!");
//     }
//     catch(e) {
//         console.log("we caught: "+e);
//     }
//     return 101;
// }
