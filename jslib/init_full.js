/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

'use strict';

const console = {
    log(...args) {
        __bios_print(false, ...args, "\n");
    },
    logPut(...args) {
        __bios_print(false, ...args);
    },
    info(...args) {
        __bios_print(false, ...args, "\n");
    },
    error(...args) {
        if (args[0] instanceof Error)
            __bios_print(true, "Error: ", args[0].message, ...args.slice(1), "\n", args[0].stack, "\n");
        else
            __bios_print(true, ...args, "\n");
    }
};

const VERSION = "4.0.0b5";

/**
 * Remove all trailing newline characters. Just a chomp :)
 *
 * @param str string to remove trailing spaces.
 * @returns {String}
 */
function chomp(str) {
    while (true) {
        const last = str.slice(-1);
        if (last == "\n" || last == "\r")
            str = str.slice(0, -1);
        else
            break;
    }
    return str;
}


/**
 * Check that two arrays (any kind) have equal components, using '=='. Shallow comparison.
 * @param a array-like object
 * @param b array-like object
 * @returns {boolean} true if 'arrays' have equal sizes and content.
 */
function equalArrays(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val == b[i]);
}

/**
 * execute some source code in the safe context where nothing critical could be accessed/altered.
 *
 * @param module structure with `exports` field to hold any exports from the code ebing evaluated
 * @param sourceUrl to show in trace
 * @param src code to evaluate.
 */
function safeEval(module, sourceUrl, src) {
    'use strict';
    // noinspection JSUnusedLocalSymbols
    // console.log(">>> import "+sourceUrl+" <<<");
    let exports = module.exports; // this one could be used in evaluated code
    eval(src + "\n//# sourceURL=" + sourceUrl);
}

function __fix_imports(source) {
    return source
        .replace(/^import\s+{(.*)}\s+from\s+(.*['"]);?$/mg, "let {$1} = {...require($2)};")
        .replace(/^import\s+\*\s+as\s+(.*)\s+from\s+(.*['"]);?$/mg, "let $1 = require($2);");
}

function __fix_require(source, moduleName) {
    return source
        .replace(/^(\s*)require\s*\(\s*(['"][^'"]+['"])\s*\)/mg, "$1require($2, \"" + moduleName + "\")")
        .replace(/(\W)require\s*\(\s*(['"][^'"]+['"])\s*\)/g, "$1require($2, \"" + moduleName + "\")");
}

const require = (function () {
    const modules = {};

    return function (moduleName, u8mName = "u8core") {
        if (!/\.[mc]?js$/.test(moduleName))
            moduleName += ".js";
        let m = modules[moduleName];
        if (m) {
            // console.log(`require ${moduleName}: HIT`);
            return m;
        } else {
            let [name, src] = __bios_loadRequired(moduleName, u8mName);
            if (src === "" || !src)
                throw "import failed: not found " + moduleName;

            // limited support for import keyword
            src = __fix_imports(src);

            // fix default require for current module
            src = __fix_require(src, u8mName);

            let module = {exports: {}};
            // we should not catch any exception to let u8 code interpret the error in
            // a right way. rethrowing an error kills trycatch.Message() info which carries
            // line number of the syntax error!
            safeEval(module, name, src);
            modules[moduleName] = module.exports;
            return module.exports;
        }
    }
})();

const load = (function () {
    const trusts = new Map();

    return function (moduleName) {
        if (!/\.[mc]?u8m$/.test(moduleName))
            moduleName += ".u8m";

        if (trusts.has(moduleName)) {
            if (!trusts.get(moduleName))
                throw "Module \"" + moduleName + "\" isn`t loaded";
        } else {
            let trust = __bios_loadModule(moduleName);
            trusts.set(moduleName, trust);

            if (!trust)
                throw "Module \"" + moduleName + "\" isn`t loaded";
        }
    }
})();

function assert(condition, text = "assertion failed") {
    if (!condition) throw Error(text);
}

const {sleep, timeout, setTimeout, clearTimeout} = {...require('timers')};

const platform = {
    hardwareConcurrency: __hardware_concurrency,
    accessLevel: 0,
    accessLevelName: "full"
};

Object.freeze(platform);



// crypto is a global module and needs global initialization:
require('crypto');

class WorkerRuntimeError extends Error {
    constructor(message = undefined, jsonData = undefined) {
        super();
        this.message = message;
        this.jsonData = jsonData;
    }
}

function freezeGlobals() {
    let global = Function('return this')();
    Object.freeze(global.__bios_print);
    Object.freeze(global.__debug_throw);
    Object.freeze(global.require);
    Object.freeze(global.load);
    Object.freeze(global.__bios_loadRequired);
    Object.freeze(global.__bios_loadModule);
    Object.freeze(global.__bios_initTimers);
    Object.freeze(global.exit);
    Object.freeze(global.utf8Decode);
    Object.freeze(global.utf8Encode);
    Object.freeze(global.__init_workers);
    Object.freeze(global.__send_from_worker);
    Object.freeze(global.IOFile);
    Object.freeze(global.IODir);
    Object.freeze(global.IOTCP);
    Object.freeze(global.IOTLS);
    Object.freeze(global.IOUDP);
    Object.freeze(global.atob);
    Object.freeze(global.btoa);
    Object.freeze(global.__verify_extendedSignature);
    Object.freeze(global.QueryResult);
    Object.freeze(global.BusyConnection);
    Object.freeze(global.PGPool);
    Object.freeze(global.HttpServerRequestBuf);
    Object.freeze(global.HttpServerSecureRequestBuf);
    Object.freeze(global.network.NodeInfoImpl);
    Object.freeze(global.network.SocketAddressImpl);
    Object.freeze(global.network.NetConfigImpl);
    Object.freeze(global.network.UDPAdapterImpl);
    Object.freeze(global.network.HttpServerImpl);
    Object.freeze(global.network.HttpClientImpl);
    Object.freeze(global.network.NodeInfo);
    Object.freeze(global.network.SocketAddress);
    Object.freeze(global.network.NetConfig);
    Object.freeze(global.network.UDPAdapter);
    Object.freeze(global.network.HttpServerRequest);
    Object.freeze(global.network.HttpServer);
    Object.freeze(global.network.HttpClient);
    Object.freeze(global.DnsServerQuestionWrapper);
    Object.freeze(global.network.DnsServerImpl);
    Object.freeze(global.network.DnsServerQuestion);
    Object.freeze(global.network.DnsServer);
    Object.freeze(global.network.DnsRRType);
    Object.freeze(global.network.DnsResolverImpl);
    Object.freeze(global.network.DnsResolver);
    Object.freeze(global.network);
    Object.freeze(global.research.MemoryUser1Impl);
    Object.freeze(global.research.MemoryUser2Impl);
    Object.freeze(global.research.MemoryUser3Impl);
    Object.freeze(global.research);
    Object.freeze(global.__boss_asyncDump);
    Object.freeze(global.__boss_asyncLoad);
    Object.freeze(global.__boss_addPrototype);
    Object.freeze(global.WorkerScripter);
    Object.freeze(global.WorkerRuntimeError);
    Object.freeze(global.wrkImpl.__getWorker);
    Object.freeze(global.wrkImpl);
    Object.freeze(global.USerializationErrorImpl);
    Object.freeze(global.gc);
    Object.freeze(global.chomp);
    Object.freeze(global.equalArrays);
    Object.freeze(global.safeEval);
    Object.freeze(global.__fix_imports);
    Object.freeze(global.__fix_require);
    Object.freeze(global.assert);
    Object.freeze(global.__call_main);
    Object.freeze(global.testReadLines);
    Object.freeze(global.testBoss);
    Object.freeze(global.logContractTree);
    Object.freeze(global.testContract);
    Object.freeze(global.testContract2);
    Object.freeze(global.testES);
    Object.freeze(global.main);
    Object.freeze(global._);
    Object.freeze(global.__args);
    Object.freeze(global.freezeGlobals);
    Object.freeze(global.getBasePath);
    Object.freeze(global.getModuleResourcesFromPath);
    Object.freeze(global.readResourceContentsAsString);
    Object.freeze(global);
}

function __call_main(args) {
    freezeGlobals();
    let result = main(args);
    if (result instanceof Promise) {
        // the promise that resolves exit code:
        result.then(code => exit(code)).catch(
            (error) => {
                if (error.stack) {
                    console.error(error.stack);
                } else
                    console.error("execution of async main failed: " + error);
                exit(1000);
            });
    } else
        exit(+result || 0);
}

// -------------------------------------- utilities


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
