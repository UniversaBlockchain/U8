const ethereum = require('ubots_ethereum.js', 'ubots_ethereum');    // require('ethereum/ubots_ethereum.js');

async function init() {
    let wallet = ethereum.createWallet();

    // save wallet to local storage
    let storage = await getLocalStorage();
    if (storage != null)
        storage.wallet = wallet;
    else
        storage = {wallet: wallet};
    await writeLocalStorage(storage);

    console.log("Test transaction: " + ethereum.createTransaction('0x0', '0x2d79883d2000', '0x5208', '0x5df9b87991262f6ba471f09758cde1c0fc1de734', '0x'));

    return wallet.address;
}