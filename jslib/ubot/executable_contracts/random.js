/**
 * Example demonstrates generate a distributed random number and reading it from storage.
 */

const BigDecimal  = require("big").Big;
const RND_LEN = 96;

/**
 * Calculate a distributed random number.
 *
 * @param {number} max - Random number generated in the range 0 >= random < max
 * @return {number} random number
 */
async function getRandom(max) {
    //generate random and write its hash to multi storage
    let rnd  = new Uint8Array(RND_LEN);
    for (let i = 0;  i < RND_LEN; ++i)
        rnd[i] = Math.floor(Math.random() * 256);

    let hash = crypto.HashId.of(rnd).base64;

    await writeMultiStorage({hash : hash});

    //calculate hash of hashes and write it to single storage
    let records = await getMultiStorage();
    let hashes = [];
    for (let r of records)
        hashes.push(r.hash);

    hashes.sort();
    let hashesHash = crypto.HashId.of(hashes.join()).base64;
    await writeSingleStorage({hashesHash : hashesHash});

    //add actual random to multi storage
    await writeMultiStorage({hash : hash, rnd : rnd});

    //verify hashesOfHash and rnd -> hash
    records = await getMultiStorage();
    hashes = [];
    let rands = [];
    for (let r of records) {
        if (r.hash !== crypto.HashId.of(r.rnd).base64)
            throw new Error("Hash does not match the random value");

        hashes.push(r.hash);
        rands.push(r.rnd);
    }
    hashes.sort();
    hashesHash = crypto.HashId.of(hashes.join()).base64;

    let singleStorage = await getSingleStorage();
    if (hashesHash !== singleStorage.hashesHash)
        throw new Error("Hash of hashes does not match the previously saved: " + hashesHash + "!==" + singleStorage.hashesHash);

    let summRandom = new BigDecimal(0);
    rands.forEach(random => {
        let bigRandom = new BigDecimal(0);
        random.forEach(byte => bigRandom = bigRandom.mul(256).add(byte));
        summRandom = summRandom.add(bigRandom);
    });

    let result = Number.parseInt(summRandom.mod(max).toFixed());

    await writeSingleStorage({hashesHash: hashesHash, result: result});

    return result;
}

/**
 * Reading generated distributed random number from storage.
 *
 * @return {number} generated random number
 */
async function readRandom() {
    return {
        random: (await getSingleStorage()).result,
        multi_data: await getMultiStorage()
    };
}