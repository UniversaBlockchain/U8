/**
 * Example demonstrates the 2-stage lottery:
 * 1) Users buy tickets, forming contracts for token transfer to the role of UBots quorum. See method "buyTicket".
 * 2) A lottery is drawn, during which the winner is determined by means of a distributed random number, and a contract
 *    for his key is formed, with all tokens played. See method "raffle".
 */

const BigDecimal = require("big").Big;
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const ItemState = require("itemstate").ItemState;
const ut = require("ubot/ubot_tools");

const RND_LEN = 96;

/**
 * Buy ticket by user
 *
 * @param {Uint8Array} packedPayment - Packed transaction with token contract for ticket payment
 * @param {PublicKey} userKey - Key to transfer winnings
 * @param {boolean} parallel - Allow parallel purchase, false by default
 * @return {number} ticket number
 */
async function buyTicket(packedPayment, userKey, parallel = false) {
    // check payment contract
    let payment = await Contract.fromPackedTransaction(packedPayment);

    let lotteryContract = ut.getExecutableContract(await Contract.fromPackedTransaction(await getRequestContract()));

    if (!lotteryContract.state.data.tokenOrigin.equals(payment.getOrigin()))
        return {error: "Improper token in payment"};

    if (lotteryContract.state.data.ticketPrice !== payment.state.data.amount)
        return {error: "Ticket cost = " + lotteryContract.state.data.ticketPrice};

    // quorum vote role
    if (!(payment.roles.owner instanceof roles.QuorumVoteRole) ||
        payment.roles.owner.source !== "refUbotRegistry.state.roles.ubots" || payment.roles.owner.quorum !== "10")
        return {error: "Invalid payment owner. Must be QuorumVoteRole of 10 ubots"};

    let refUbotRegistry = payment.findConstraintByName("refUbotRegistry");
    if (payment.transactional === null || refUbotRegistry === null ||
        refUbotRegistry.type !== Constraint.TYPE_TRANSACTIONAL ||
        !refUbotRegistry.assemblyConditions(refUbotRegistry.conditions).equals(
            {all_of: ["ref.tag==\"universa:ubot_registry_contract\""]}
            )
        )
        return {error: "Invalid payment constraint: refUbotRegistry"};

    let refUbot = payment.findConstraintByName("refUbot");
    if (refUbot === null || refUbot.type !== Constraint.TYPE_TRANSACTIONAL ||
        !refUbot.assemblyConditions(refUbot.conditions).equals(
            {all_of: ["this.ubot==\"" + lotteryContract.getOrigin().base64 + "\""]}
            )
        )
        return {error: "Invalid payment constraint: refUbot"};

    // register ticket payment contract
    let ir = await registerContract(packedPayment);
    if (ir.state !== ItemState.APPROVED.val)
        return {error: "Payment contract is not registered, item state: " + ir.state};

    if (parallel)
        await startTransaction("csSingleStorage");      // enter to the critical section for work with the single storage

    // get storage
    let storage = await getSingleStorage();
    let first = false;
    if (storage == null || (!storage.hasOwnProperty("tickets") && !storage.hasOwnProperty("payments") && !storage.hasOwnProperty("userKeys")))
        first = true;

    // check storage
    if (!first && (
        !(storage.hasOwnProperty("tickets") && storage.hasOwnProperty("payments") && storage.hasOwnProperty("userKeys")) ||
        storage.payments.length !== storage.tickets || storage.userKeys.length !== storage.tickets)
        )
        throw new Error("Error storage checking");

    // get ticket number, save payment and user key and increase number of tickets
    let ticket = 0;
    if (!first) {
        ticket = storage.tickets;
        storage.payments.push(packedPayment);
        storage.userKeys.push(userKey);
        storage.tickets++;
    } else {
        if (storage == null)
            storage = {};
        storage.tickets = 1;
        storage.payments = [packedPayment];
        storage.userKeys = [userKey];
    }

    await writeSingleStorage(storage);

    if (parallel)
        await finishTransaction("csSingleStorage");      // leave the critical section

    return ticket;
}

/**
 * Calculate a distributed random number.
 *
 * @param {number} max - Random number generated in the range 0 >= random < max
 * @return {number} random number
 */
async function getRandom(max) {
    let rnd  = new Uint8Array(RND_LEN);
    for (let i = 0;  i < RND_LEN; ++i)
        rnd[i] = Math.floor(Math.random() * 256);

    let hash = crypto.HashId.of(rnd).base64;

    await writeMultiStorage({hash : hash});

    //calculate hash of hashes and write it to single storage
    let records = await getMultiStorage();
    let hashes = [];
    for (let r of records)
        hashes.push(r.hash);

    hashes.sort();
    let hashesHash = crypto.HashId.of(hashes.join()).base64;

    let singleStorage = await getSingleStorage();
    singleStorage.hashesHash = hashesHash;

    await writeSingleStorage(singleStorage);

    //add actual random to multi storage
    await writeMultiStorage({hash : hash, rnd : rnd});

    //verify hashesOfHash and rnd -> hash
    records = await getMultiStorage();
    hashes = [];
    let rands = [];
    for (let r of records) {
        if (r.hash !== crypto.HashId.of(r.rnd).base64)
            throw new Error("Hash does not match the random value");

        hashes.push(r.hash);
        rands.push(r.rnd);
    }
    hashes.sort();
    hashesHash = crypto.HashId.of(hashes.join()).base64;

    if (hashesHash !== singleStorage.hashesHash)
        throw new Error("Hash of hashes does not match the previously saved: " + hashesHash + "!==" + singleStorage.hashesHash);

    let summRandom = new BigDecimal(0);
    rands.forEach(random => {
        let bigRandom = new BigDecimal(0);
        random.forEach(byte => bigRandom = bigRandom.mul(256).add(byte));
        summRandom = summRandom.add(bigRandom);
    });

    let result = Number.parseInt(summRandom.mod(max).toFixed());
    singleStorage.winTicket = result;

    await writeSingleStorage(singleStorage);

    return result;
}

/**
 * Implementing join procedure (from ContractsService).
 * Service create new revision of first contract, update amount field with sum of amount fields in the both contracts
 * and put second contract in revoking items of created new revision.
 * Given contract should have splitjoin permission for given keys.
 *
 * Not cloud method.
 *
 * @param {Iterable<Contract>} contractsToJoin - One or more contracts to join into main contract.
 * @param {Array<number | string | BigDecimal>} amountsToSplit - Array contains one or more amounts to split from main contract.
 * @param {Array<crypto.KeyAddress>} addressesToSplit - Addresses the ownership of splitted parts will be transferred to.
 * @param {Iterable<crypto.PrivateKey> | null} ownerKeys - Owner keys of joined contracts.
 * @param {string} fieldName - Name of field that should be join by.
 * @return {Array<Contract>} list of contracts containing main contract followed by splitted parts.
 */
async function createSplitJoin(contractsToJoin, amountsToSplit, addressesToSplit, ownerKeys, fieldName) {
    let contract = null;
    let sum = new BigDecimal(0);
    for (let c of contractsToJoin) {
        if (contract == null) {
            contract = c;
            contract = await contract.createRevision(ownerKeys);
        } else
            contract.revokingItems.add(c);

        if (c.state.data[fieldName] == null)
            throw new ex.IllegalArgumentError("createSplitJoin: not found field state.data." + fieldName);

        sum = sum.add(new BigDecimal(c.state.data[fieldName]));
    }

    let parts = [];
    if (amountsToSplit != null && amountsToSplit.length > 0 && addressesToSplit != null && addressesToSplit.length > 0) {
        parts = await contract.split(amountsToSplit.length);
        for (let i = 0; i < parts.length; i++) {
            sum = sum.sub(new BigDecimal(amountsToSplit[i]));
            parts[i].registerRole(new roles.SimpleRole("owner", addressesToSplit[i]));
            parts[i].state.data[fieldName] = new BigDecimal(amountsToSplit[i]).toFixed();

            await parts[i].seal();
        }
    }

    contract.state.data[fieldName] = sum.toFixed();
    await contract.seal(true);

    return [contract].concat(parts);
}

/**
 * Raffle the lottery and generate winning.
 *
 * @return {object} lottery result:
 *      {
 *          {number} winTicket - win ticket number
 *          {Uint8Array} prizeContract - packed transaction with lottery winning
 *      }
 */
async function raffle() {
    let result = {};

    // get storage
    let storage = await getSingleStorage();

    result.winTicket = await getRandom(storage.tickets);

    // join prize
    let payments = await Promise.all(storage.payments.map(payment => Contract.fromPackedTransaction(payment)));
    let prize = (await createSplitJoin(payments, null, null, null, "amount"))[0];

    // make as pool contract revision (synchronize state.createdAt and set creator to QuorumVoteRole)
    prize = await Contract.fromPackedTransaction(await preparePoolRevision(await prize.getPackedTransaction()));

    // transfer prize to winner key
    prize.registerRole(new roles.SimpleRole("owner", storage.userKeys[result.winTicket], prize));
    await prize.seal(true);

    storage.prizeContract = result.prizeContract = await sealAndGetPackedTransactionByPool(await prize.getPackedTransaction());

    // save prize contract to storage
    await writeSingleStorage(storage);

    // register prize contract
    let ir = await registerContract(result.prizeContract);
    if (ir.state !== ItemState.APPROVED.val)
        return {error: "Prize contract is not registered, item state: " + ir.state};

    return result;
}