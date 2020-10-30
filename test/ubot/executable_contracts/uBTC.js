const ethereum = require('ubots_ethereum.js', 'ubots_ethereum');    // require('ethereum/ubots_ethereum.js');

async function init(ethereumURL, ethereumContract) {
    let wallet = ethereum.createWallet();

    // save wallet to local storage
    let storage = await getLocalStorage();
    if (storage != null)
        return {status: "Fail", error: "initialized storage is not empty"};

    await writeLocalStorage({wallet: wallet, mintId: 0, ethereumURL: ethereumURL, ethereumContract: ethereumContract});

    return {status: "OK", wallet: wallet.address};
}

async function changeEthereumURL(ethereumURL) {
    let storage = await getLocalStorage();
    if (storage == null)
        return {status: "Fail", error: "local storage is empty"};

    storage.ethereumURL = ethereumURL;
    await writeLocalStorage(storage);

    return {status: "OK"};
}

async function changeEthereumContract(ethereumContract) {
    let storage = await getLocalStorage();
    if (storage == null)
        return {status: "Fail", error: "local storage is empty"};

    storage.ethereumContract = ethereumContract;
    await writeLocalStorage(storage);

    return {status: "OK"};
}

async function mint(address, amount) {
    let storage = await getLocalStorage();
    if (storage == null)
        return {status: "Fail", error: "local storage is empty"};

    // get gas price
    let result = await doHTTPRequest(storage.ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}');
    let gasPrice = JSON.parse(utf8Decode(result.body)).result;
    console.log("Test eth_gasPrice: " + gasPrice);

    // get nonce
    result = await doHTTPRequest(storage.ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["' + storage.wallet.address + '","latest"],"id":2}');
    let nonce = JSON.parse(utf8Decode(result.body)).result;
    console.log("Test eth_getTransactionCount: " + nonce);

    // form transaction
    console.log("Test transaction: " + ethereum.createTransaction(nonce, gasPrice, '0x5208', storage.ethereumContract, '0x'));

    return {status: "OK"};
}