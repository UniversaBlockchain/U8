/**
 * Example demonstrates the creation of a pool contract and its registration from pool of UBots.
 */

/**
 * Create and register a pool contract.
 *
 * @return {Uint8Array} packed transaction with pool contract
 */
async function register() {
    let packedContract = null;
    try {
        // creation of a pool contract
        let contract = await createPoolContract();

        await contract.seal(true);

        packedContract = await contract.getPackedTransaction();
    } catch (err) {
        console.error("register ERR: " + err.message);
        console.error("register ERR stack: " + err.stack);
    }

    // register transaction with pool contract
    await registerContract(packedContract);

    return packedContract;
}