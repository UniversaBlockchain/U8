load("http://localhost:8000/test_module.u8m");
const module = require("second", "test_module");

async function main(args) {
    module.testFunc(20);
}