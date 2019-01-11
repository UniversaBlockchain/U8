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
            if( src == "")
                throw "import failed: not found "+moduleName;

            // limited support for import keyword
            src = src.replace(/^import\s+{(.*)}\s+from\s+(.*['"]);?$/mg, "let {$1} = {...require($2)};");

            // console.log( "---", src, "^^^");
            try {
                let module = {exports: {}};
                eval("(function(module){let exports=module.exports;" + src + "})(module);\n//# sourceURL=" + name + "\n");
                modules[moduleName] = module.exports;
                return module.exports;
            } catch (e) {
                // var err = e.constructor(`in ${moduleName}: ${e.message}`);
                // +3 because `err` has the line number of the `eval` line plus two.
                // err.lineNumber = e.lineNumber - err.lineNumber + 3;
                console.error(`${name}:1 ${e}`);
                console.error(e.stack);
                // throw e;
                throw e;
            }
        }
    }
})();

const {sleep, timeout, setTimeout, clearTimeout} = {...require('timers')};

async function test() {
    await sleep(2370);
    console.log("test1!");
}

async function test2() {
    let pr = sleep(1370);
    timeout(900, () => pr.cancel() );
    try {
        await pr;
        console.log("test2 failed!");
    }
    catch(e) {
        console.log("test2ok: "+e);
    }
}

test();
test2();
setTimeout(() => console.log("setTimeout: OK"), 3300);
let tt = setTimeout(()=>console.log("BAD!"), 300);
clearTimeout(tt);
'hello' + ', ' + 'world'
