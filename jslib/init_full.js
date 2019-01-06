const console = {
    log: __bios_print,
    info: __bios_print,
    error: __bios_print
};

console.log("Initializing isolate, full mode");

const require = (function() {
    const modules = {};

    return function(moduleName) {
        let m = modules[moduleName];
        if( m ) {
            // console.log(`require ${moduleName}: HIT`);
            return m;
        }
        else {
            // console.log(`require: ${moduleName}: LOAD`);
            let [name, src] = __bios_loadRequired(moduleName)
            // console.log("full name: "+name);
            // console.log("src: \n"+src);
            try {
                const module = { exports: {} }
                let fn = Function( "module", src+ "\n//# sourceURL="+name+"\n");
                fn(module);
                // console.log("Very good we got the result: " + result);
                modules[moduleName] = module.exports;
                return module;
            }
            catch(e) {
                console.log("Error: "+e);
                console.log(e.stack);
            }
        }
    }
})();

timers = require('timers.js')


// require("test_require_1.js");
// tr1 = require("test_require_1.js");
// require("mod2");

// tr1.fun1()


'hello' + ', ' + 'world'
