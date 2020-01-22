async function transaction(num) {
    await sleep(10);
    console.log("startTransactions... "+ num);
    for (let i = 0; i < 10; i++) {
        console.log("startTransaction...");
        await startTransaction("trans");
        await sleep(Math.random()*100);
        await finishTransaction("trans");
        await sleep(Math.random()*100);
    }
    console.log("finishTransactions"+ num);
    return num;
}