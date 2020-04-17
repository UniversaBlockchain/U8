const t = require("tools", "u8core");

function testFunc(len) {
    console.log("TEST RANDOM STRING: " + t.randomString(len));
}

module.exports = {testFunc};