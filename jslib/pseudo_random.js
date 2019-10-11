/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const BigDecimal  = require("big").Big;

class PseudoRandom {
    constructor(seedHash) {
        let seed = [];
        let digest = seedHash.digest;
        let bytesInSeed = digest.length / 4;

        for (let i = 0; i < 4; i++) {
            let bigRandom = new BigDecimal(0);
            // 257 for dependence on every byte of digest
            digest.slice(i * bytesInSeed, (i + 1) * bytesInSeed).forEach(byte => bigRandom = bigRandom.mul(257).add(byte));
            seed[i] = Number.parseInt(bigRandom.mod(4294967296).toFixed());
        }

        this.rand = this.sfc32(seed[0], seed[1], seed[2], seed[3]);
    }

    sfc32(a, b, c, d) {
        return function() {
            a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
            let t = (a + b) | 0;
            a = b ^ b >>> 9;
            b = c + (c << 3) | 0;
            c = (c << 21 | c >>> 11);
            d = d + 1 | 0;
            t = t + d | 0;
            c = c + t | 0;
            return (t >>> 0) / 4294967296;
        }
    }

    randomBytes(count) {
        let result  = new Uint8Array(count);
        for (let i = 0;  i < count; ++i)
            result[i] = Math.floor(this.rand() * 256);
        return result;
    }

    randomString(length) {
        let string = "";
        let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < length; i++)
            string += possible.charAt(Math.floor(this.rand() * possible.length));

        return string;
    }
}

module.exports = {PseudoRandom};