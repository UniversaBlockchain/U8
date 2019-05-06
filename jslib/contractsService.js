/**
 * @module network
 */
const Contract = require("contract").Contract;
const TransactionPack = require("transactionpack").TransactionPack;
const Parcel = require("parcel").Parcel;
const roles = require('roles');
const BigDecimal  = require("big").Big;
const Constraint = require('constraint').Constraint;
const ex = require("exceptions");

/**
 * Implementing revoking procedure.
 * Service create temp contract with given contract in revoking items and return it.
 * That temp contract should be send to Universa and given contract will be revoked.
 *
 * @param {Contract} c - Contract should revoked be.
 * @param {[crypto.PrivateKey]} keys - keys from owner of c.
 * @return {Contract} working contract that should be register in the Universa to finish procedure.
 */
async function createRevocation(c, ...keys) {

    let tc = new Contract();

    // by default, transactions expire in 30 days
    tc.definition.expiresAt = tc.definition.createdAt;
    tc.definition.expiresAt.setDate(tc.definition.expiresAt.getDate() + 30);

    let issuerRole = new roles.SimpleRole("issuer", keys);
    tc.registerRole(issuerRole);
    tc.createRole("owner", issuerRole);
    tc.createRole("creator", issuerRole);

    if (!tc.revokingItems.has(c)) {
        let revocationAction = {action : "remove", id : c.id};
        if (tc.definition.data.hasOwnProperty("actions"))
            tc.definition.data.actions.push(revocationAction);
        else
            tc.definition.data.actions = [revocationAction];

        tc.revokingItems.add(c);
    }

    await tc.seal();

    return tc;
}

/**
 * Implementing split procedure for token-type contracts.
 * Service create new revision of given contract, split it to a pair of contracts with split amount.
 * Given contract should have splitjoin permission for given keys.
 *
 * @param {Contract} c - Contract should split be.
 * @param {BigDecimal} amount - Value that should be split from given contract.
 * @param {String} fieldName - Name of field that should be split.
 * @param {Set<crypto.PrivateKey>} keys - Keys from owner of c.
 * @param {boolean} andSetCreator - If true set owners as creator in both contarcts.
 * @return {Contract} working contract that should be register in the Universa to finish procedure.
 */
async function createSplit(c, amount, fieldName, keys, andSetCreator = false) {
    let splitFrom = c.createRevision([]);
    let splitTo = splitFrom.splitValue(fieldName, new Decimal(amount));

    for (let key of keys) {
        splitFrom.addSignerKey(key);
    }
    if (andSetCreator) {
        splitTo.createRole("creator", splitTo.role("owner"));
        splitFrom.createRole("creator", splitFrom.role("owner"));
    }
    await splitTo.seal(true);
    await splitFrom.seal(true);

    return splitFrom;
}

/**
 * Implementing join procedure.
 * Service create new revision of first contract, update amount field with sum of amount fields in the both contracts
 * and put second contract in revoking items of created new revision.
 * Given contract should have splitjoin permission for given keys.
 *
 * @param {Contract} contract1 - Contract should be join to.
 * @param {Contract} contract2 - Contract should be join.
 * @param {String} fieldName - Name of field that should be join by.
 * @param {Set<crypto.PrivateKey>} keys - Keys from owner of both contracts.
 * @return {Contract} working contract that should be register in the Universa to finish procedure.
 */
async function createJoin(contract1, contract2, fieldName, keys) {
    let joinTo = contract1.createRevision([]);

    joinTo.getStateData().set(
        fieldName,
        //InnerContractsService.getDecimalField(contract1, fieldName).add(InnerContractsService.getDecimalField(contract2, fieldName))
    );

    for (let key of keys) {
        joinTo.addSignerKey(key);
    }

    joinTo.addRevokingItems(contract2);

    await joinTo.seal(true);

    return joinTo;
}

/**
 * Implementing join procedure.
 * Service create new revision of first contract, update amount field with sum of amount fields in the both contracts
 * and put second contract in revoking items of created new revision.
 * Given contract should have splitjoin permission for given keys.
 *
 * @param contractsToJoin one or more contracts to join into main contract
 * @param amountsToSplit  one or more amounts to split from main contract
 * @param addressesToSplit are addresses the ownership of splitted parts will be transferred to
 * @param fieldName is name of field that should be join by
 * @param ownerKeys owner keys of joined contracts
 * @return list of contracts containing main contract followed by splitted parts.
 */
/*async function createSplitJoin(Collection<Contract> contractsToJoin, List<String> amountsToSplit, List<KeyAddress> addressesToSplit,Set<PrivateKey> ownerKeys, String fieldName) {
    Iterator<Contract> it = contractsToJoin.iterator();
    Contract contract = it.next();
    contract = contract.createRevision(ownerKeys);
    BigDecimal sum = new BigDecimal(contract.getStateData().getStringOrThrow(fieldName));
    while (it.hasNext()) {
        Contract c = it.next();
        sum = sum.add(new BigDecimal(c.getStateData().getStringOrThrow(fieldName)));
        contract.addRevokingItems(c);
    }
    Contract[] parts = contract.split(amountsToSplit.size());
    for(int i = 0; i < parts.length;i++) {
        sum = sum.subtract(new BigDecimal(amountsToSplit.get(i)));
        parts[i].setOwnerKeys(addressesToSplit.get(i));
        parts[i].getStateData().set(fieldName,amountsToSplit.get(i));

        parts[i].seal();
    }
    contract.getStateData().set(fieldName,sum.toString());
    contract.seal();
    ArrayList<Contract> arrayList = new ArrayList<>();
    arrayList.add(contract);
    arrayList.addAll(Do.listOf(parts));
    return arrayList;
}*/

/**
 * Creates a contract with two signatures.
 * The service creates a contract which asks two signatures.
 * It can not be registered without both parts of deal, so it is make sure both parts that they agreed with contract.
 * Service creates a contract that should be send to partner,
 * then partner should sign it and return back for final sign from calling part.
 *
 * @param {Contract} baseContract - Base contract.
 * @param {Set<crypto.PrivateKey>} fromKeys - Own private keys.
 * @param {Set<crypto.PublicKey>} toKeys - Foreign public keys.
 * @param {boolean} createNewRevision - Create new revision if true.
 * @return {Contract} contract with two signatures that should be send from first part to partner.
 */
async function createTwoSignedContract(baseContract, fromKeys, toKeys, createNewRevision) {

    let twoSignContract = baseContract;

    if (createNewRevision) {
        twoSignContract = baseContract.createRevision(fromKeys);
        twoSignContract.keysToSignWith.clear();
    }

    let creatorFrom = new roles.SimpleRole("creator", fromKeys); //TODO

    let ownerTo = new roles.SimpleRole("owner", toKeys);

    twoSignContract.createTransactionalSection();
    twoSignContract.transactional.id = (HashId.createRandom().toBase64String());

    let constraint = new Constraint(twoSignContract);
    constraint.transactional_id = twoSignContract.transactional.id;
    constraint.type = Constraint.TYPE_TRANSACTIONAL;
    constraint.required = true;
    constraint.signed_by = [];
    constraint.signed_by.push(creatorFrom);
    constraint.signed_by.push(ownerTo);
    twoSignContract.transactional().addConstraint(constraint);

    twoSignContract.setOwnerKeys(toKeys);

    await twoSignContract.seal();

    return twoSignContract;
}

/**
 * Create paid transaction, which consist from contract you want to register and payment contract that will be
 * spend to process transaction.
 *
 * @param {Contract | TransactionPack} payload - Is prepared contract you want to register in the Universa.
 * @param {Contract} payment - Is approved contract with "U" belongs to you.
 * @param {number} amount - Is number of "U" you want to spend to register payload contract.
 * @param {Set<crypto.PrivateKey>} keys - Is own private keys, which are set as owner of payment contract.
 * @param {boolean} withTestPayment - If true {@link Parcel} will be created with test payment.
 * @return {Parcel} Parcel, it ready to send to the Universa.
 */
async function createParcel(payload, payment, amount, keys, withTestPayment = false) {

    let paymentDecreased = payment.createRevision(keys);
    let payloadPack;
    if (payload instanceof Contract) {
        paymentDecreased.getTransactionalData()["id"] = payload.id.base64;

        if (payload.transactionPack == null)
            payloadPack = payload.transactionPack = new TransactionPack(this);
    } else if (payload instanceof TransactionPack)
        payloadPack = payload;
    else
        throw new ex.IllegalArgumentError("Illegal type of payload. Expected Contract or TransactionPack.");

    if (withTestPayment)
        paymentDecreased.state.data.test_transaction_units = payment.state.data.test_transaction_units - amount;
    else
        paymentDecreased.state.data.transaction_units = payment.state.data.transaction_units - amount;

    await paymentDecreased.seal(true);

    return new Parcel(payloadPack, paymentDecreased.transactionPack);
}