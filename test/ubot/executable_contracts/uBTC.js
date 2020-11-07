const ethWallet = require('wallet.js', 'ubots_ethereum');
const ethRPC = require('rpc.js', 'ubots_ethereum');
const ethTransaction = require('transaction.js', 'ubots_ethereum');
const ethCommon = require('common.js', 'ubots_ethereum');

async function init(ethereumURL, ethereumContract, startMintId) {
    let wallet = ethWallet.createWallet();

    // save wallet to local storage
    let storage = await getLocalStorage();
    if (storage != null)
        return {status: "Fail", error: "initialized storage is not empty"};

    await writeLocalStorage({wallet: wallet});

    // init mintId and ethereum metadata in single storage
    let singleStorage = await getSingleStorage();
    if (singleStorage != null)
        return {status: "Fail", error: "initialized single storage is not empty"};

    await writeSingleStorage({mintId: startMintId, ethereumURL: ethereumURL, ethereumContract: ethereumContract});

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

        let mintId = BigInt(singleStorage.mintId) + BigInt(1);
        singleStorage.mintId = mintId.toString(10);

        await writeSingleStorage(singleStorage);

    await finishTransaction("csMint");

    let gasPrice = await ethRPC.getGasPrice(doHTTPRequest, singleStorage.ethereumURL);
    console.log("eth_gasPrice: " + gasPrice);

    let nonce = await ethRPC.getNonce(doHTTPRequest, singleStorage.ethereumURL, localStorage.wallet.address);
    console.log("eth_getTransactionCount: " + nonce);

    let chainId = await ethRPC.getChainId(doHTTPRequest, singleStorage.ethereumURL);
    console.log("eth_chainId: " + chainId);

    // form transaction
    // 0x836a1040 - first bytes Keccak-256 of "mint(uint256,address,uint256)"
    let data = ethTransaction.generateTransactionData("0x836a1040", [singleStorage.mintId, address, amount]);

    let estimateGas = await ethRPC.estimateGas(doHTTPRequest, singleStorage.ethereumURL, singleStorage.ethereumContract, localStorage.wallet.address, data);
    console.log("eth_estimateGas: " + estimateGas);
    estimateGas = ethCommon.fromNumber(Math.max(ethCommon.toNumber(estimateGas) + 100000, 1000000));

    let transaction = ethTransaction.createTransaction(chainId, nonce, gasPrice, estimateGas, singleStorage.ethereumContract, "0x", data);
    console.log("Formed transaction: " + transaction);

    // sign transaction
    let signed = ethTransaction.signTransaction(transaction, localStorage.wallet.privateKey);
    console.log("Signed transaction: " + signed);

    // send transaction
    let transactionHash = await ethRPC.sendTransaction(doHTTPRequest, singleStorage.ethereumURL, signed);
    console.log("Transaction hash: " + transactionHash);

    let receipt = await ethRPC.waitTransaction(doHTTPRequest, singleStorage.ethereumURL, transactionHash);
    console.log("Transaction receipt: " + JSON.stringify(receipt));

    return {status: "OK"};
}