/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

'use strict';

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
            let customLib = false;
            let [name, src] = __bios_loadRequired(moduleName);
            if (src == "" || !src) {
                customLib = true;
                src = __require_from_worker(moduleName);
                name = moduleName;
            }
            if (src == "" || !src)
                throw "import failed: not found " + moduleName;

            // limited support for import keyword
            src = __fix_imports(src);

            let module = {exports: {}}
            // we should not catch any exception to let u8 code interpret the error in
            // a right way. rethrowing an error kills trycatch.Message() info which carries
            // line number of the syntax error!
            safeEval(module, name, src);
            if (!customLib)
                modules[moduleName] = module.exports;
            return module.exports;
        }
    }
})();

function assert(condition, text = "assertion failed") {
    if (!condition) throw Error(text);
}

const {sleep, timeout, setTimeout, clearTimeout} = {...require('timers')};

const platform = {
    hardwareConcurrency: 1, // hide it in restricted mode
    accessLevel: 1,
    accessLevelName: "restricted"
};

Object.freeze(platform);



// crypto is a global module and needs global initialization:
require('crypto');

function freezeGlobals() {
    let global = Function('return this')();
    Object.freeze(global.__bios_loadRequired);
    Object.freeze(global.__bios_initTimers);
    Object.freeze(global.utf8Decode);
    Object.freeze(global.utf8Encode);
    Object.freeze(global.__init_workers);
    Object.freeze(global.__send_from_worker);
    Object.freeze(global.__require_from_worker);
    Object.freeze(global.atob);
    Object.freeze(global.btoa);
    Object.freeze(global.__verify_extendedSignature);
    Object.freeze(global.__boss_asyncDump);
    Object.freeze(global.__boss_asyncLoad);
    Object.freeze(global.__boss_addPrototype);
    Object.freeze(global.WorkerScripter);
    Object.freeze(global.wrkInner);
    Object.freeze(global.USerializationErrorImpl);
    Object.freeze(global.gc);
    Object.freeze(global.chomp);
    Object.freeze(global.equalArrays);
    Object.freeze(global.safeEval);
    Object.freeze(global.__fix_imports);
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
    Object.freeze(global);
}

function __call_main(args) {
    freezeGlobals();
}
