const BigDecimal = require("big").Big;
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const ItemState = require("itemstate").ItemState;
const ut = require("ubot/ubot_tools");

/**
 * Put token into wallet.
 *
 * @param {Uint8Array} packedToken - Packed transaction with token to put into wallet
 * @return {string | object} new balance of wallet (or object with error)
 */
async function putTokenIntoWallet(packedToken) {
    // check payment contract
    let token = await Contract.fromPackedTransaction(packedToken);

    let walletContract = ut.getExecutableContract(await Contract.fromPackedTransaction(await getRequestContract()));

    // quorum vote role
    let quorum = walletContract.state.data.cloud_methods.putTokenIntoWallet.quorum.size.toString();
    if (!(token.roles.owner instanceof roles.QuorumVoteRole) ||
        token.roles.owner.source !== "refUbotRegistry.state.roles.ubots" || token.roles.owner.quorum !== quorum)
        return {error: "Invalid token owner. Must be QuorumVoteRole of " + quorum + " UBots"};

    let refUbotRegistry = token.findConstraintByName("refUbotRegistry");
    if (token.transactional === null || refUbotRegistry === null ||
        refUbotRegistry.type !== Constraint.TYPE_TRANSACTIONAL ||
        !refUbotRegistry.assemblyConditions(refUbotRegistry.conditions).equals(
            {all_of: ["ref.tag==\"universa:ubot_registry_contract\""]}
        )
    )
        return {error: "Invalid token constraint: refUbotRegistry"};

    // get storage
    let storage = await getSingleStorage();

    if (storage == null) {
        storage = {};
        storage.currency = null;
        storage.balance = null;
        storage.tokens = [];
        storage.operations = [];
    } else if (storage.currency == null || storage.balance == null ||
        !(storage.tokens instanceof Array) || !(storage.operations instanceof Array))       // check storage
        throw new Error("Error storage checking");

    // check token currency
    if (storage.currency != null && storage.currency !== token.definition.data.currency)
        return {error: "Invalid token currency, need: " + storage.currency};

    // register token contract
    let ir = await registerContract(packedToken);
    if (ir.state !== ItemState.APPROVED.val)
        return {error: "Token contract is not registered, item state: " + ir.state};

    if (storage.currency == null)
        storage.currency = token.definition.data.currency;

    let amount = new BigDecimal(token.state.data.amount);
    if (storage.balance == null)
        storage.balance = amount.toFixed();
    else
        storage.balance = amount.add(new BigDecimal(storage.balance)).toFixed();

    storage.tokens.push(packedToken);
    storage.operations.push({
        operation: "put",
        amount: amount.toFixed()
    });

    await writeSingleStorage(storage);

    return storage.balance;
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
 * @param {Array<number | string | BigDecimal> | null} amountsToSplit - Array contains one or more amounts to split from main contract.
 * @param {Array<crypto.KeyAddress> | null} addressesToSplit - Addresses the ownership of splitted parts will be transferred to.
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
 * Transfer token from wallet to specified address.
 *
 * @param {string | number | BigDecimal} amount - Amount of tokens to transfer
 * @param {crypto.KeyAddress} recipientAddress - Address of recipient
 * @return {Uint8Array} sealed binary of token contract to transfer
 */
async function makeTranfer(amount, recipientAddress) {
    let storage = await getSingleStorage();

    // check storage
    if (storage == null)
        throw new Error("Wallet is empty");
    else if (storage.currency == null || storage.balance == null ||
        !(storage.tokens instanceof Array) || !(storage.operations instanceof Array))
        throw new Error("Error storage checking");

    if (new BigDecimal(storage.balance).lt(new BigDecimal(amount)))
        throw new Error("Insufficient funds");

    // make join and split
    let tokens = await Promise.all(storage.tokens.map(token => Contract.fromPackedTransaction(token)));
    let splits = await createSplitJoin(tokens, [amount], [recipientAddress], null, "amount");

    // make as pool contract revisions (synchronize state.createdAt and set creator to QuorumVoteRole)
    let remainder = await preparePoolRevision(await splits[0].getPackedTransaction());

    let transfer = Array.from((await Contract.fromPackedTransaction(remainder)).newItems)[0];

    // register SplitJoin
    let ir = await registerContract(remainder);
    if (ir.state !== ItemState.APPROVED.val)
        return {error: "SplitJoin is not registered, item state: " + ir.state};

    // save operation to storage
    storage.tokens = [remainder];
    storage.operations.push({
        operation: "transfer",
        amount: new BigDecimal(amount).toFixed(),
        recipient: recipientAddress
    });

    await writeSingleStorage(storage);

    return transfer.sealedBinary;
}

/**
 * Get last wallet operation.
 *
 * @return {object | null} last wallet operation
 * {
 *      operation: {string} "put" or "transfer"
 *      amount: {string} amount of tokens
 *      recipient {KeyAddress} address of recipient (if operation is "transfer")
 * }
 * or null - if no operations in wallet
 */
async function getLastOperation() {
    let storage = await getSingleStorage();
    if (storage.operations == null)
        return null;

    return storage.operations[storage.operations.length - 1];
}

/**
 * Get list of all wallet operations.
 *
 * @return {Array<object>} list of all wallet operations (as object
 * {
 *      operation: {string} "put" or "transfer"
 *      amount: {string} amount of tokens
 *      recipient {KeyAddress} address of recipient (if operation is "transfer")
 * })
 */
async function getOperations() {
    let storage = await getSingleStorage();
    if (storage.operations == null)
        return [];

    return storage.operations;
}

/**
 * Get current balance.
 *
 * @return {string} current balance
 */
async function getBalance() {
    let storage = await getSingleStorage();
    if (storage.balance == null)
        return "0";

    return storage.balance;
}