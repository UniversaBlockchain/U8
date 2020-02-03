async function transaction(num) {
    let requestId = (await Contract.fromPackedTransaction(await getRequestContract())).id;
    let ubotNumber = await getUBotNumber();
    //console.log("startTransaction... " + num + " Request: " + requestId + " UBotNumber: " + ubotNumber);
    for (let i = 0; i < 10; i++) {
        console.log("startTransaction..." + num + " Request: " + requestId + " UBotNumber: " + ubotNumber + ". Iteration = " + i);
        await startTransaction("trans");
        await sleep(Math.random() * 100);
        console.log("finishTransaction... " + num + " Request: " + requestId + " UBotNumber: " + ubotNumber + ". Iteration = " + i);
        await finishTransaction("trans");
        await sleep(Math.random() * 100);
    }
    return num;
}