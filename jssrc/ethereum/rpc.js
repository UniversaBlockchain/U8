const common = require('common.js');

const defaultId = 10;
const averageBlockTime = 15000;
const minTimeout = averageBlockTime / 5;
const waitForReceiptBlocks = 3;

/**
 * Get current gas price.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @return {string} gas price as hex string.
 * @throws {Error} RPC error.
 */
async function getGasPrice(doHTTPRequest, ethereumURL) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_gasPrice: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Get next transaction index (nonce) for Ethereum address.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param address {string} Ethereum address.
 * @return {string} nonce as hex string.
 * @throws {Error} RPC error.
 */
async function getNonce(doHTTPRequest, ethereumURL, address) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["' + address + '","latest"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_getTransactionCount: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Estimate gas limit for Ethereum call (transaction etc...).
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param ethereumContract {string} Ethereum address which called to (usually contract address).
 * @param address {string} Ethereum address which called from.
 * @param data {string} transaction data as hex string.
 * @return {string} estimated gas limit as hex string.
 * @throws {Error} RPC error.
 */
async function estimateGas(doHTTPRequest, ethereumURL, ethereumContract, address, data) {
    let param = {from: address, to: ethereumContract, data: data};
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_estimateGas","params":[' + JSON.stringify(param) + '],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_estimateGas: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Get chain ID.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @return {string} chain ID as hex string.
 * @throws {Error} RPC error.
 */
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

/**
 * Get latest block number.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @return {string} latest block number as hex string.
 * @throws {Error} RPC error.
 */
async function getBlockNumber(doHTTPRequest, ethereumURL) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_blockNumber: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Send signed raw transaction for registration in blockchain.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param transaction {string} signed raw transaction as hex string.
 * @return {string} transaction hash as hex string.
 * @throws {Error} RPC error.
 */
async function sendTransaction(doHTTPRequest, ethereumURL, transaction) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["' + transaction + '"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_sendRawTransaction: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Check transaction, get transaction receipt.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param transactionHash {string} transaction hash as hex string.
 * @return {Object} transaction receipt object.
 * @throws {Error} RPC error.
 */
async function checkTransaction(doHTTPRequest, ethereumURL, transactionHash) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["' + transactionHash + '"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_getTransactionReceipt: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Execute Ethereum call without change blockchain and spending gas.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param from {string} Ethereum address which called from.
 * @param to {string} Ethereum address which called to (usually contract address).
 * @param data {string} call data as hex string.
 * @param value {string} call value as hex string. Optional.
 * @return {string} call result as hex string.
 * @throws {Error} RPC error.
 */
async function call(doHTTPRequest, ethereumURL, from, to, data, value = null) {
    let param = {from: from, to: to, data: data};
    if (value)
        param.value = value;
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_call","params":[' + JSON.stringify(param) + ',"latest"],"id":' + defaultId + '}');
    let parsed = JSON.parse(utf8Decode(result.body));
    if (parsed.result == null && parsed.error != null)
        throw new Error("RPC error in eth_call: " + JSON.stringify(parsed.error));
    else
        return parsed.result;
}

/**
 * Wait transaction registration in blockchain with defined blocks confirmations.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param transactionHash {string} transaction hash as hex string.
 * @param confirmations {number} blocks confirmations number. Default 12.
 * @return {Object} transaction receipt object.
 * @throws {Error} RPC error or error registration transaction.
 */
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

    if (confirmedReceipt == null || confirmedReceipt.blockNumber !== receipt.blockNumber ||
        confirmedReceipt.status !== "0x1" || confirmedReceipt.transactionHash !== transactionHash)
        throw new Error("Error checking latest transaction receipt: " + JSON.stringify(confirmedReceipt));

    return receipt;
}

/**
 * Register signed raw transaction in blockchain with defined blocks confirmations.
 *
 * @param doHTTPRequest {function} HTTP request function as doHTTPRequest(url, method, headers, body). See UBot API.
 * @param ethereumURL {string} URL for connection to Ethereum node.
 * @param transaction {string} signed raw transaction hash as hex string.
 * @param confirmations {number} blocks confirmations number. Default 12.
 * @return {Object} transaction receipt object.
 * @throws {Error} RPC error or error registration transaction.
 */
async function doTransaction(doHTTPRequest, ethereumURL, transaction, confirmations = 12) {
    let transactionHash = await sendTransaction(doHTTPRequest, ethereumURL, transaction);
    return await waitTransaction(doHTTPRequest, ethereumURL, transactionHash, confirmations);
}

module.exports = {getGasPrice, getNonce, getChainId, estimateGas, getBlockNumber, sendTransaction, checkTransaction,
    call, waitTransaction, doTransaction};