/**
 * @module network
 */
const Contract = require("contract").Contract;
const roles = require('roles');
let BigDecimal  = require("big").Big;
const Constraint = require('constraint').Constraint;

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