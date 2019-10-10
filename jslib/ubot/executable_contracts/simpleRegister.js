//const Contract = require("contract").Contract;

async function register(packedContract) {
    //let contract = await Contract.fromPackedTransaction(packedContract);
    //console.error("contract.id = " + contract.id);

    await registerContract(packedContract, false);

    return packedContract;
}