const common = require('common.js');

async function getGasPrice(doHTTPRequest, ethereumURL, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":' + id + '}');
    return JSON.parse(utf8Decode(result.body)).result;
}

async function getNonce(doHTTPRequest, ethereumURL, address, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["' + address + '","latest"],"id":' + id + '}');
    return JSON.parse(utf8Decode(result.body)).result;
}

async function estimateGas(doHTTPRequest, ethereumURL, ethereumContract, address, data, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        common.generateEstimateGasRequest(id, address, ethereumContract, null, data));
    return JSON.parse(utf8Decode(result.body)).result;
}

async function getChainId(doHTTPRequest, ethereumURL, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":' + id + '}');
    let chain = JSON.parse(utf8Decode(result.body)).result;
    if (chain != null)
        return chain;

    result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"net_version","params":[],"id":' + id + '}');
    chain = JSON.parse(utf8Decode(result.body)).result;
    if (chain == null)
        return null;
    else
        return "0x" + parseInt(chain, 10).toString(16);
}

async function getBlockNumber(doHTTPRequest, ethereumURL, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":' + id + '}');
    return JSON.parse(utf8Decode(result.body)).result;
}

async function sendTransaction(doHTTPRequest, ethereumURL, transaction, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["' + transaction + '"],"id":' + id + '}');
    return JSON.parse(utf8Decode(result.body)).result;
}

async function checkTransaction(doHTTPRequest, ethereumURL, transactionHash, id) {
    let result = await doHTTPRequest(ethereumURL, "POST", "Content-Type: application/json\r\n",
        '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["' + transactionHash + '"],"id":' + id + '}');
    return JSON.parse(utf8Decode(result.body)).result;
}

module.exports = {getGasPrice, getNonce, getChainId, estimateGas, getBlockNumber, sendTransaction, checkTransaction};