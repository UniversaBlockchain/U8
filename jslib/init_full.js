'use strict';

const console = {
    log: __bios_print,
    info: __bios_print,
    error: __bios_print,
};

const VERSION = "4.0.0b4";

/**
 * execute some source code in the safe context where nothing critical could be accessed/altered.
 *
 * @param module structure with `exports` field to hold any exports from the code ebing evaluated
 * @param sourceUrl to show in trace
 * @param src code to evaluate.
 */
function safeEval(module, sourceUrl, src) {
    // noinspection JSUnusedLocalSymbols
    // console.log(">>> import "+sourceUrl+" <<<");
    let exports = module.exports; // this one could be used in evaluated code
    eval(src + "\n//# sourceURL=" + sourceUrl);
}

function __fix_imports(source) {
    return source.replace(/^import\s+{(.*)}\s+from\s+(.*['"]);?$/mg, "let {$1} = {...require($2)};");
}

const require = (function () {
    const modules = {};

    return function (moduleName) {
        if (!/\.[mc]?js$/.test(moduleName))
            moduleName += ".js";
        let m = modules[moduleName];
        if (m) {
            // console.log(`require ${moduleName}: HIT`);
            return m;
        } else {
            let [name, src] = __bios_loadRequired(moduleName);
            if (src == "" || !src)
                throw "import failed: not found " + moduleName;

            // limited support for import keyword
            src = __fix_imports(src);

            let module = {exports: {}}
            // we should not catch any exception to let u8 code interpret the error in
            // a right way. rethrowing an error kills trycatch.Message() info which carries
            // line number of the syntax error!
            safeEval(module, name, src);
            modules[moduleName] = module.exports;
            return module.exports;
        }
    }
})();

function assert(condition, text) {
    if (!condition) throw Error(text);
}

const {sleep, timeout, setTimeout, clearTimeout} = {...require('timers')};

function __call_main(args) {
    let result = main(args);
    if (result instanceof Promise) {
        waitExit();
        result
            .then(code => exit(code))
            .catch((error) => {
                if( error.stack ) {
                    console.error(error.stack);
                }
                else
                    console.error("execution of aysnc main failed: "+error);
                exit(1000);
            });
        return 0;
    } else
        return result || 0;
}

// -------------------- crypto init --------------
crypto.SHA256 = 1;
crypto.SHA512 = 2;
crypto.SHA3_256 = 3;
crypto.SHA3_384 = 4;
crypto.SHA3_512 = 5;

crypto.PrivateKey.prototype.sign = function(data, hashType=crypto.SHA3_256) {
    if( typeof(data) == 'string' ) {
        data = utf8Encode(data);
    }
    if( data instanceof Uint8Array)
        return this.__sign(data, hashType);
    else
        throw new Error("Wrong data type: "+typeof(data));
};

crypto.PublicKey.prototype.verify = function(data, signature, hashType=crypto.SHA3_256) {
    if( typeof(data) == 'string' ) {
        data = utf8Encode(data);
    }
    if( data instanceof Uint8Array)
        return this.__verify(data, signature, hashType);
    else
        throw new Error("Wrong data type: "+typeof(data));
};

Object.defineProperty(crypto.PrivateKey.prototype, "publicKey", {
    get: function() {
        if( !this.__publicKey );
            this.__publicKey = new crypto.PublicKey(this);
        return this.__publicKey;
    }
});

Object.defineProperty(crypto.PrivateKey.prototype, "packed", {
    get: function() {
        if( !this.__packed );
            this.__packed = this.__pack();
        return this.__packed;
    }
});

Object.defineProperty(crypto.PublicKey.prototype, "packed", {
    get: function() {
        if( !this.__packed );
        this.__packed = this.__pack();
        return this.__packed;
    }
});

Object.defineProperty(crypto.PublicKey.prototype, "shortAddress", {
    get: function() {
        if( !this.__shortAddress );
            this.__shortAddress = new crypto.KeyAddress(this, 0, false);
        return this.__shortAddress;
    }
});

Object.defineProperty(crypto.PublicKey.prototype, "longAddress", {
    get: function() {
        if( !this.__longAddress );
            this.__longAddress = new crypto.KeyAddress(this, 0, true);
        return this.__longAddress;
    }
});

Object.defineProperty(crypto.PublicKey.prototype, "fingerprints", {
    get: function() {
        if( !this.__fingerprints );
            this.__fingerprints = this.__getFingerprints();
        return this.__fingerprints;
    }
});


Object.defineProperty(crypto.PrivateKey.prototype, "shortAddress", {
    get: function() {
        if( !this.__shortAddress );
            this.__shortAddress = this.publicKey.shortAddress;
        return this.__shortAddress;
    }
});

Object.defineProperty(crypto.PrivateKey.prototype, "longAddress", {
    get: function() {
        if( !this.__longAddress );
            this.__longAddress = this.publicKey.longAddress;
        return this.__longAddress;
    }
});

Object.defineProperty(crypto.KeyAddress.prototype, "packed", {
    get: function() {
        if( !this.__packed );
            this.__packed = this.getPacked();
        return this.__packed;
    }
});

/**
 * Calculate digest of a string or binary data (Uint8Array). UTF8 encoding is used if a string is given.
 *
 * @param type any of crypto.SHA* constants
 * @param {string | Uint8Array} data
 * @returns {Uint8Array} binary digest
 */
crypto.digest = (hashType, data) => {
    if( typeof(data) == 'string')
        data = utf8Encode(data);
    return crypto.__digest(hashType,data);
}

/**
 * Universa HashId implementation.
 *
 * @type {crypto.HashId}
 */
crypto.HashId = class extends crypto.HashIdImpl {
    /**
     * Construct HashId for a given data
     *
     * @param {Uint8Array|string} data to calculate hashId of
     *
     * @returns {crypto.HashId}
     */
    static of(data) {
        if( typeof(data) == 'string' )
            data = utf8Encode(data);
        return new crypto.HashId(false, data);
    }

    /**
     * Construct HashId with pre-calculated digest.
     *
     * @param {Uint8Array} digest
     * @returns {crypto.HashId}
     */
    static withDigest(digest) {
        return new crypto.HashId(true, digest);
    }

    /**
     * Construct HashId with pre-calculated digest in base64 encoded form
     * @param {string} digest in base64 encoding
     * @returns {crypto.HashId}
     */
    static withBase64Digest(digest) {
        return new crypto.HashId(true, atob(digest));
    }

    /**
     * Get the digest as binary array
     * @returns {Uint8Array}
     */
    get digest() {
        if( !this.__digest ) this.__digest = this.__getDigest();
        return this.__digest;
    }

    /**
     * Get the digest as base64-encoded string
     * @returns {string} base64 encoded digest
     */
    get base64() {
        if( !this.__base64 ) this.__base64 = this.__getBase64String();
        return this.__base64;
    }

    /**
     * Check that this HashId is equal to another hashId.
     * @param anotherId anything that imlements {digest} getter.
     * @returns {boolean}
     */
    equals(anotherId) {
        return equalArrays(this.digest, anotherId.digest);
    }
};

// -------------------------------------- utilities

/**
 * Check that two arrays have equal components, using '==='. Shallow comarison.
 * @param a array-like object
 * @param b array-like object
 * @returns {boolean} true if 'arrays' have equal sizes and content.
 */
function equalArrays(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    return a.every((val, i) => val === b[i]);
}

// async function test() {
//     await sleep(2370);
//     console.log("test1!");
// }
//
// async function test2() {
//     let pr = sleep(1370, true);
//     timeout(900, () => pr.cancel());
//     try {
//         await pr;
//         console.log("test2 failed!");
//     } catch (e) {
//         console.log("test2ok: " + e);
//     }
// }

// function test_security1() {
//     let was = require;
//     // console.log(require);
//     require('test_require_1');
//     if (was != require) {
//         console.log("require could be compromised");
//     } else {
//         console.log("OK");
//     }
//     // assert(was != require, "111");
// }

// let timers1 = require("timers")
// test_security1();
// let timers2 = require("timers")
// if (timers1 != timers2) {
//     console.log("timers gave been changed!");
// }
// console.log(timers1.version);
// console.log(timers2.version);
//
// let ll = require ("lala.js");
// console.log(ll);
// test_security1();
// p8132p;kl
// console.log("-----------------initialization done--------------------------------");
// test();
// test2();
// setTimeout(() => console.log("setTimeout: OK"), 3300);
// let tt = setTimeout(() => console.log("BAD!"), 300);
// clearTimeout(tt);
// 'hello' + ', ' + 'world'
