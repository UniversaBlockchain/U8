const common = require('common.js');
const defaultId = 10;
const averageBlockTime = 15000;
const minTimeout = averageBlockTime / 5;
const waitForReceiptBlocks = 3;

async function getGasPrice(doHTTPRequest, ethereumURL) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_gasPrice: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function getNonce(doHTTPRequest, ethereumURL, address) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["' + address + '","latest"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_getTransactionCount: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function estimateGas(doHTTPRequest, ethereumURL, ethereumContract, address, data) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        common.generateEstimateGasRequest(defaultId, address, ethereumContract, null, data));
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_estimateGas: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function getChainId(doHTTPRequest, ethereumURL) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":' + defaultId + '}');
    let chain = JSON.parse(utf8Decode(result.body)).result;
    if (chain != null)
        return chain;

    result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"net_version","params":[],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    chain = parsed.result;
    if (chain == null) {
        if (parsed.error != null)
            throw new Error("RPC error in net_version: " + JSON.stringify(parsed.error));

        return null;
    } else
        return common.fromNumber(parseInt(chain, 10));
}

async function getBlockNumber(doHTTPRequest, ethereumURL) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_blockNumber: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function sendTransaction(doHTTPRequest, ethereumURL, transaction) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["' + transaction + '"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_sendRawTransaction: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function checkTransaction(doHTTPRequest, ethereumURL, transactionHash) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["' + transactionHash + '"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_getTransactionReceipt: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

async function waitTransaction(doHTTPRequest, ethereumURL, transactionHash, confirmations = 12) {
    let lastBlock = common.toNumber(await getBlockNumber(doHTTPRequest, ethereumURL));

    // wait receipt
    let receipt = null;
    let currentBlock = lastBlock;
    while (receipt == null) {
        await sleep(minTimeout);
        receipt = await checkTransaction(doHTTPRequest, ethereumURL, transactionHash);

        if (receipt == null) {
            currentBlock = common.toNumber(await getBlockNumber(doHTTPRequest, ethereumURL));
            if (currentBlock > lastBlock + waitForReceiptBlocks)
                throw new Error("Transaction isn`t accepted for " + waitForReceiptBlocks + " blocks");
        }
    }

    // check receipt
    if (receipt.status !== "0x1")
        throw new Error("Transaction status is " + receipt.status);
    if (receipt.transactionHash !== transactionHash)
        throw new Error("Transaction hash from receipt is wrong");

    // wait confirmations
    if (confirmations <= 0)
        return receipt;

    lastBlock = common.toNumber(receipt.blockNumber);
    let timeout = Math.max(confirmations * averageBlockTime / 2, minTimeout);
    while (true) {
        await sleep(timeout);

        currentBlock = common.toNumber(await getBlockNumber(doHTTPRequest, ethereumURL));
        if (currentBlock >= lastBlock + confirmations)
            break;
        else if (currentBlock === lastBlock + confirmations - 1)
            timeout = minTimeout;
        else
            timeout = Math.max(timeout / 2, minTimeout);
    }

    let confirmedReceipt = await checkTransaction(doHTTPRequest, ethereumURL, transactionHash);

    if (confirmedReceipt == null || JSON.stringify(confirmedReceipt) !== JSON.stringify(receipt))
        throw new Error("Error comparison transaction receipts");

    return receipt;
}

async function doTransaction(doHTTPRequest, ethereumURL, transaction, confirmations = 12) {
    let transactionHash = await sendTransaction(doHTTPRequest, ethereumURL, transaction);
    return await waitTransaction(doHTTPRequest, ethereumURL, transactionHash, confirmations);
}

module.exports = {getGasPrice, getNonce, getChainId, estimateGas, getBlockNumber, sendTransaction, checkTransaction,
    waitTransaction, doTransaction};