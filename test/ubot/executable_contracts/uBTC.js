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

    return wallet.address;
}