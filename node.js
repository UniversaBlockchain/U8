const Main = require("main").Main;


async function main() {

    let main = await new Main("--config", "../test/config/test_single_node/node1").run();

    await new Promise(resolve => setTimeout(resolve,100000000000));

    await main.shutdown();
}