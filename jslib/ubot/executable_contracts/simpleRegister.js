const Contract = require("contract").Contract;

async function register(packedContract) {
    // try {
        let contract = await Contract.fromPackedTransaction(packedContract);
        console.log("contract.id = " + contract.id);
    // } catch (err) {
    //     console.error("register ERR: " + err.message);
    //     console.error("register ERR stack: " + err.stack);
    // }

    await registerContract(packedContract, false);

    return packedContract;
}