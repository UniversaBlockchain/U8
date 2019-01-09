const console = {
    log: __bios_print,
    info: __bios_print,
    error: __bios_print
};

console.log("Initializing isolate, full mode");

const require = (function () {
    const modules = {};

    return function (moduleName) {
        let m = modules[moduleName];
        if (m) {
            // console.log(`require ${moduleName}: HIT`);
            return m;
        } else {
            if( !/\.[mc]?js$/.test(moduleName) )
                moduleName += ".js";
            let [name, src] = __bios_loadRequired(moduleName);
            try {
                let module = {exports: {}};
                eval("(function(module){let exports=module.exports;" + src + "})(module);\n//# sourceURL=" + name + "\n");
                modules[moduleName] = module.exports;
                return module.exports;
            } catch (e) {
                console.error(e.stack);
                throw e;
            }
        }
    }
})();

timers = require('timers.js');

// require("test_require_1.js");
// tr1 = require("test_require_1.js");
// require("mod2");

// tr1.fun1()

'hello' + ', ' + 'world'
