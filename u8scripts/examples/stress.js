/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

async function main() {
    console.log("stress.js started");

    let sendCounter = 0;
    let readyCounter = 0;
    let privkey = await crypto.PrivateKey.generate(2048);
    let pubkey = privkey.publicKey;

    let data = utf8Encode("shit happens");
    let signature = await privkey.sign(data, crypto.SHA3_256);

    for (let k = 0; k < 1000; ++k) {
        for (let i = 0; i < 1000000; ++i) {
            ++sendCounter;
            // console.log("-- "+sendCounter);
            pubkey.__verify(data, signature, crypto.SHA3_256, async (val) => {
                await sleep(10);
                ++readyCounter;
                if (readyCounter % 10000 == 0)
                    console.log("readyCounter = " + readyCounter);
                resolve(val);
            });
            if (sendCounter - readyCounter > 1000) {
                await sleep(10);
            }
        }
        console.log("============ " + k + " ============");
    }

    //never ends
    await sleep(Number.MAX_SAFE_INTEGER);
}