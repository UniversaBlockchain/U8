async function getNumbers(delayed) {

    let num = await getUBotNumber();
    let inPool = await getUBotNumberInPool();

    console.log("number = " + num);
    console.log("number in pool = " + inPool);

    if (~delayed.indexOf(inPool)) {
        console.log("ubot {" + num + ", " + inPool + "} sleeping...");
        await sleep(60000);
        console.log("ubot {" + num + ", " + inPool + "} is awakened");
    }

    await writeMultiStorage({number : num, inPool : inPool});

    // return all cortege
    return await getMultiStorage();
}