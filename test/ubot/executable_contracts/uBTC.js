const ethWallet = require('wallet.js', 'ubots_ethereum');
const ethRPC = require('rpc.js', 'ubots_ethereum');
const ethTransaction = require('transaction.js', 'ubots_ethereum');
const ethCommon = require('common.js', 'ubots_ethereum');
const ethSignature = require('signature.js', 'ubots_ethereum');

async function init(ethereumURL, ethereumContract, startPayETHId) {
    let wallet = ethWallet.createWallet();

    // save wallet to local storage
    let storage = await getLocalStorage();
    if (storage != null)
        return {status: "Fail", error: "initialized storage is not empty"};

    await writeLocalStorage({wallet: wallet});

    // init payETHId and ethereum metadata in single storage
    let singleStorage = await getSingleStorage();
    if (singleStorage != null)
        return {status: "Fail", error: "initialized single storage is not empty"};

    await writeSingleStorage({
        payETHId: startPayETHId,
        ethereumURL: ethereumURL,
        ethereumContract: ethereumContract,
        invoices: [],
        ethereumTransactions: []
    });

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

async function BTCtoETH(address, amount) {
    // check arguments
    if (typeof address !== "string" || !address.startsWith("0x") || address.length !== 42)
        return {status: "Fail", error: "address is wrong"};
    if (typeof amount !== "string" && typeof amount !== "number")
        return {status: "Fail", error: "amount is wrong"};

    let localStorage = await getLocalStorage();
    if (localStorage == null)
        return {status: "Fail", error: "local storage is empty"};

    // critical section for payETHId in single-storage
    await startTransaction("csPayETH");

        let singleStorage = await getSingleStorage();
        if (singleStorage == null) {
            await finishTransaction("csPayETH");
            return {status: "Fail", error: "single storage is empty"};
        }

        let payETHId = BigInt(singleStorage.payETHId) + BigInt(1);
        singleStorage.payETHId = payETHId.toString(10);

        await writeSingleStorage(singleStorage);

    await finishTransaction("csPayETH");

    let gasPrice = await ethRPC.getGasPrice(doHTTPRequest, singleStorage.ethereumURL);
    console.log("eth_gasPrice: " + gasPrice);

    let nonce = await ethRPC.getNonce(doHTTPRequest, singleStorage.ethereumURL, localStorage.wallet.address);
    console.log("eth_getTransactionCount: " + nonce);

    let chainId = await ethRPC.getChainId(doHTTPRequest, singleStorage.ethereumURL);
    console.log("eth_chainId: " + chainId);

    // form transaction
    // 0x836a1040 - first bytes Keccak-256 of "mint(uint256,address,uint256)"
    let data = ethTransaction.generateTransactionData("0x836a1040", [singleStorage.payETHId, address, amount]);

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

    // wait pay ETH
    // 0xeb7604af - first bytes Keccak-256 of "checkMinted(uint256)"
    data = ethTransaction.generateTransactionData("0xeb7604af", [singleStorage.payETHId]);

    let timeout = 1000;
    for (let i = 0; i < 50; i++) {
        let result = await ethRPC.call(doHTTPRequest, singleStorage.ethereumURL, localStorage.wallet.address, singleStorage.ethereumContract, data);
        console.log("checkMinted(" + singleStorage.payETHId + ") result: " + result);

        if (result === "0x0000000000000000000000000000000000000000000000000000000000000001")
            return {status: "OK"};

        await sleep(timeout);
        if (timeout < 15000)
            timeout += 1000;
    }

    return {status: "Fail", error: "ETH wasn`t paid"};
}

function parseInvoice(msg) {
    let invoice = {};

    return invoice;
}

async function ETHtoBTC(signature, address, amount) {
    // check arguments
    if (typeof address !== "string")    //TODO: check BTC address
        return {status: "Fail", error: "address is wrong"};
    if (typeof amount !== "string" && typeof amount !== "number")
        return {status: "Fail", error: "amount is wrong"};

    if (!ethSignature.verifySignature(signature))
        return {status: "Fail", error: "signature is wrong"};

    let senderAddress = signature.address;
    let invoice = null;
    try {
        invoice = parseInvoice(signature.msg);
    } catch (err) {
        return {status: "Fail", error: "error parsing invoice: " + err.message};
    }

    console.log("Parsed invoice: " + JSON.stringify(invoice));

    let singleStorage = await getSingleStorage();
    if (singleStorage == null)
        return {status: "Fail", error: "single storage is empty"};

    let transactionsLog = [];

    // check invoice transactions
    for (let transaction of invoice.transactions) {
        let receipt = await ethRPC.waitTransaction(doHTTPRequest, singleStorage.ethereumURL, transaction);
        console.log("Transaction receipt: " + JSON.stringify(receipt));

        if (receipt != null && receipt.from === senderAddress && receipt.to === singleStorage.ethereumContract) {
            //TODO: eth_getTransactionByHash
        }
    }

    return {status: "OK", transactionsLog: transactionsLog};
}