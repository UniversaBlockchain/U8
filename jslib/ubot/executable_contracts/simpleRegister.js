const Contract = require("contract").Contract;

async function register(packedContract) {
    console.error("start");

    let contract = await Contract.fromPackedTransaction(packedContract);
    console.error("contract.id = " + contract.id);

    await registerContract(contract, false);

    return contract;
}