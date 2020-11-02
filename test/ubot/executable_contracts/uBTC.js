const ethereum = require('ubots_ethereum.js', 'ubots_ethereum');    // require('ethereum/ubots_ethereum.js');

async function init(ethereumURL, ethereumContract) {
    let wallet = ethereum.createWallet();

    // save wallet to local storage
    let storage = await getLocalStorage();
    if (storage != null)
        return {status: "Fail", error: "initialized storage is not empty"};

    await writeLocalStorage({wallet: wallet});

    // init mintId and ethereum metadata in single storage
    let singleStorage = await getSingleStorage();
    if (singleStorage != null)
        return {status: "Fail", error: "initialized single storage is not empty"};

    await writeSingleStorage({mintId: 0, ethereumURL: ethereumURL, ethereumContract: ethereumContract});

    return {status: "OK", wallet: wallet.address};
}

async function changeEthereumURL(ethereumURL) {
    let storage = await getSingleStorage();
    if (storage == null)
        return {status: "Fail", error: "single storage is empty"};

    storage.ethereumURL = ethereumURL;
    await writeSingleStorage(storage);

    return {status: "OK"};
}

async function changeEthereumContract(ethereumContract) {
    let storage = await getSingleStorage();
    if (storage == null)
        return {status: "Fail", error: "single storage is empty"};

    storage.ethereumContract = ethereumContract;
    await writeSingleStorage(storage);

    return {status: "OK"};
}

async function mint(address, amount) {
    // check arguments
    if (typeof address !== "string" || !address.startsWith("0x") || address.length !== 42)
        return {status: "Fail", error: "address is wrong"};
    if (typeof amount !== "string" && typeof amount !== "number")
        return {status: "Fail", error: "amount is wrong"};

    let localStorage = await getLocalStorage();
    if (localStorage == null)
        return {status: "Fail", error: "local storage is empty"};

    // critical section for mintId in single-storage
    await startTransaction("csMint");

        let singleStorage = await getSingleStorage();
        if (singleStorage == null) {
            await finishTransaction("csMint");
            return {status: "Fail", error: "single storage is empty"};
        }

        singleStorage.mintId++;

        await writeSingleStorage(singleStorage);

    await finishTransaction("csMint");

    // get gas price
    let result = await doHTTPRequest(singleStorage.ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}');
    let gasPrice = JSON.parse(utf8Decode(result.body)).result;
    console.log("eth_gasPrice: " + gasPrice);

    // get nonce
    result = await doHTTPRequest(singleStorage.ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["' + localStorage.wallet.address + '","latest"],"id":2}');
    let nonce = JSON.parse(utf8Decode(result.body)).result;
    console.log("eth_getTransactionCount: " + nonce);

    // form transaction
    // 0x836a1040 - first bytes Keccak-256 of "mint(uint256,address,uint256)"
    let data = ethereum.generateTransactionData("0x836a1040", [singleStorage.mintId, address, amount]);
    console.log("Formed transaction: " + ethereum.createTransaction(nonce, gasPrice, '0x5208', singleStorage.ethereumContract, "0x", data));

    // estimate gas
    result = await doHTTPRequest(singleStorage.ethereumURL, "POST", "Content-Type: application/json\r\n",
        ethereum.generateEstimateGasRequest(3, localStorage.wallet.address, singleStorage.ethereumContract, null, data));

    console.log("eth_estimateGas_res: " + utf8Decode(result.body));
    let estimateGas = JSON.parse(utf8Decode(result.body)).result;
    console.log("eth_estimateGas: " + estimateGas);

    // sign transaction
    // send transaction

    return {status: "OK"};
}