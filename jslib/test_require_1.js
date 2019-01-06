
console.log("require1 is being prcessed!!");

var myInternal = "FOO";

function exportFrom1() {
    console.log("Export from 1-");
}

module.exports = { fun1: exportFrom1 };

// eee.dsds = 11

