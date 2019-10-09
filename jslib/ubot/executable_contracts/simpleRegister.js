async function register(contract) {

    await registerContract(contract, false);

    return contract;
}