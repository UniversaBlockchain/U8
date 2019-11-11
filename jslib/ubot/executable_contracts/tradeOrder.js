const Boss = require('boss.js');

async function stopOrder(stopPrice) {
    let price = await new Promise(async(resolve) => {
        let work = true;
        while (work) {
            let result = await doHTTPRequest("http://localhost:8080/getPrice");
            result.body = await Boss.load(result.body);     // Test HTTP server return packed response with price

            if (result.response_code === 200 && result.body.result === "ok") {
                console.log("Received price: " + result.body.response.price);

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

    await writeMultiStorage({price: price});

    return await getMultiStorage();
}