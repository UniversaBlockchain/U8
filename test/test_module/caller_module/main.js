load("test_module");
const module = require("second", "test_module");

async function main(args) {
    module.testFunc(20);
}