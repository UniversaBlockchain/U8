//Contract.js already initialized in worker for serialization/deserialization result of helper method createPoolContract
//const Contract = require("contract").Contract;

async function register(packedContract) {
    // try {
        let contract = await Contract.fromPackedTransaction(packedContract);
        console.log("contract.id = " + contract.id);
    // } catch (err) {
    //     console.error("register ERR: " + err.message);
    //     console.error("register ERR stack: " + err.stack);
    // }

    await registerContract(packedContract);

    return packedContract;
}