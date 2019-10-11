//const Boss = require('boss.js');

async function register() {
    let packedContract = null;
    try {
        let contract = await createPoolContract();
        //console.log("before contract.id = " + contract.id);

        await contract.seal(true);

        //console.log("contract.id = " + contract.id);

        //let res =  await Boss.load((await Boss.load(contract.sealedBinary)).data);
        //console.error("compare = " + JSON.stringify(res));

        packedContract = await contract.getPackedTransaction();
    } catch (err) {
        console.error("register ERR: " + err.message);
        console.error("register ERR stack: " + err.stack);
    }

    await registerContract(packedContract);

    return packedContract;
}