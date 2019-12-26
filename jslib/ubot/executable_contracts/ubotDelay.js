/**
 * Example demonstrates determine tuple when several UBot instances are not active.
 */

/**
 * Determine tuple with unique number of UBot instances.
 *
 * @param {Array<number>} delayed - List of number of UBot instances that are delayed for 40 seconds
 * @return {object} tuple with unique number of UBot instances
 */
async function getNumbers(delayed) {

    // get unique number from UBot instances
    let num = await getUBotNumber();            // return unique UBot instance number
    let inPool = await getUBotNumberInPool();   // return number of UBot instance in pool

    console.log("number = " + num);
    console.log("number in pool = " + inPool);

    if (~delayed.indexOf(inPool)) {
        // delay for some UBot instances
        console.log("ubot {" + num + ", " + inPool + "} sleeping...");
        await sleep(40000);
        console.log("ubot {" + num + ", " + inPool + "} is awakened");
    }

    // save result
    await writeMultiStorage({number : num, inPool : inPool});

    // return all cortege
    return await getMultiStorage();
}