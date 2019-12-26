/**
 * Example demonstrates execution of HTTP-requests.
 */

const Boss = require('boss.js');

/**
 * Performs HTTP-requests on the specified URL, receiving a price until it becomes higher than the specified value,
 * then saves and returns the received price.
 *
 * @param {number} stopPrice - Value of the price which the UBot is waiting for
 * @return {Array<object>} tuple with got prices from UBot instances
 */
async function stopOrder(stopPrice) {
    let price = await new Promise(async(resolve) => {
        let work = true;
        while (work) {
            // Execute HTTP-request
            let result = await doHTTPRequest("http://localhost:8080/getPrice");
            result.body = await Boss.load(result.body);     // HTTP server return packed (with BOSS) response with price

            // checking response
            if (result.response_code === 200 && result.body.result === "ok") {
                console.log("Received price: " + result.body.response.price);

                // compare received price with stopPrice
                if (result.body.response.price >= stopPrice) {
                    console.log("Stop order triggered!");
                    work = false;
                    resolve(result.body.response.price);
                    break;
                }
            }

            await sleep(1000);
        }
    });

    // save prices to storage
    await writeMultiStorage({price: price});

    // return tuple with prices
    return await getMultiStorage();
}