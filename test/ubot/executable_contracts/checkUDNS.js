/**
 * Example demonstrates the checking and registration UDNS contract from pool of UBots.
 */

const NSmartContract = require("services/NSmartContract").NSmartContract;
const Compound = require("compound").Compound;
const Parcel = require("parcel").Parcel;

const DNS_TXT = 16;

const DNSlist = [
    ["127.0.0.1", 5353],
    //["8.8.4.4", 53]     // host, port
];

/**
 * Register UDNS contract.
 *
 * @param {Uint8Array} packed - packed transaction with UDNS contract.
 * @return {Promise<ItemState>} - Result of registration UDNS contract.
 */
async function register(packed) {
    let contract = await Contract.fromPackedTransaction(packed);
    return await registerTransaction(packed, contract, null);
}

/**
 * Register UDNS contract.
 *
 * @param {Uint8Array} packed - packed transaction with compound of UDNS contract.
 * @return {Promise<ItemState>} - Result of registration UDNS contract.
 */
async function registerCompound(packed) {
    let compound = await Compound.fromPackedTransaction(packed);
    let contract = await compound.getContractByTag(Parcel.COMPOUND_MAIN_TAG);
    if (contract == null)
        throw new Error("Contract not found in compound.");

    return await registerTransaction(packed, contract, [contract.id.base64]);
}

async function registerTransaction(packed, contract, contractIdsForPoolSign) {
    if (contract.definition.extendedType !== NSmartContract.SmartContractType.UNS2)
        throw new Error("Contract must have UNS2 type.");

    let names = contract.getNames();

    for (let ri of contract.revokingItems)
        if (ri.definition.extendedType === NSmartContract.SmartContractType.UNS2)
            ri.getNames().forEach(name => names.delete(name));

    if (names.size > 0) {
        let dns = DNSlist[Math.floor(await poolRandom() * DNSlist.length)];

        names = Array.from(names);
        let queries = [];
        for (let name of names)
            queries.push({name: name, type: DNS_TXT});

        let result = await doDNSRequests(dns[0], dns[1], queries);

        let mainContract = (contract.transactionPack != null) ? contract.transactionPack.contract : contract;
        await mainContract.check();

        let addresses = new Set();
        Array.from(contract.effectiveKeys.keys()).forEach(key => {
            addresses.add(key.longAddress.toString());
            addresses.add(key.shortAddress.toString());
        });

        let untrustedNames = [];
        result.forEach((answer, i) => {
            if (!answer.some(record => record.type === DNS_TXT && addresses.has(record.value)))
                untrustedNames.push(names[i]);
        });

        if (untrustedNames.length > 0)
            throw new Error("UDNS contract can`t register DNS names: " + JSON.stringify(untrustedNames));
    }

    return (await registerContract(packed, contractIdsForPoolSign)).state;
}