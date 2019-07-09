async function main() {
    console.log("stress.js started");

    let sendCounter = 0;
    let readyCounter = 0;
    let privkey = await crypto.PrivateKey.generate(2048);
    let pubkey = privkey.publicKey;
    for (let k = 0; k < 1000; ++k) {
        for (let i = 0; i < 1000000; ++i) {
            ++sendCounter;
            pubkey.__verify(utf8Encode("data"), utf8Encode("signature"), crypto.SHA3_256, async (val) => {
                await sleep(10);
                ++readyCounter;
                if (readyCounter % 10000 == 0)
                    console.log("readyCounter = " + readyCounter);
                resolve(val);
            });
            if (sendCounter - readyCounter > 1000)
                await sleep(10);
        }
        console.log("============ " + k + " ============");
    }

    //never ends
    await sleep(Number.MAX_SAFE_INTEGER);
}