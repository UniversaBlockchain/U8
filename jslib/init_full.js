'use strict';

const console = {
    log: __bios_print,
    info: __bios_print,
    error: __bios_print
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
    'strict mode';
    // noinspection JSUnusedLocalSymbols
    let exports = module.exports; // this one could be used in evaluated code
    eval(src + "\n//# sourceURL=" + sourceUrl + "\n");
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
            if (src == "")
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

// async function test() {
//     await sleep(2370);
//     console.log("test1!");
// }
//
// async function test2() {
//     let pr = sleep(1370);
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
