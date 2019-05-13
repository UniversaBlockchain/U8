/**
 * @module contractsservice
 */
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

const Contract = require("contract").Contract;
const TransactionPack = require("transactionpack").TransactionPack;
const Parcel = require("parcel").Parcel;
const roles = require('roles');
const perms = require('permissions');
const BigDecimal  = require("big").Big;
const Constraint = require('constraint').Constraint;
const ex = require("exceptions");

/**
 * Implementing revoking procedure.
 * Service create temp contract with given contract in revoking items and return it.
 * That temp contract should be send to Universa and given contract will be revoked.
 *
 * @param {Contract} c - Contract should revoked be.
 * @param {[crypto.PrivateKey]} keys - Keys from owner of revoking contract.
 * @return {Contract} working contract that should be register in the Universa to finish procedure.
 */
async function createRevocation(c, ...keys) {

    let tc = new Contract();

    // by default, transactions expire in 30 days
    tc.definition.expiresAt = new Date(tc.definition.createdAt);
    tc.definition.expiresAt.setDate(tc.definition.expiresAt.getDate() + 30);

    tc.registerRole(new roles.SimpleRole("issuer", keys));
    tc.registerRole(new roles.RoleLink("owner", "issuer"));
    tc.registerRole(new roles.RoleLink("creator", "issuer"));

    tc.definition.data.actions = [{action : "remove", id : c.id}];
    tc.revokingItems.add(c);

    await tc.seal(true);

    return tc;
}

/**
 * Implementing split procedure for token-type contracts.
 * Service create new revision of given contract, split it to a pair of contracts with split amount.
 * Given contract should have splitjoin permission for given keys.
 *
 * @param {Contract} c - Contract should split be.
 * @param {number | string | BigDecimal} amount - Value that should be split from given contract.
 * @param {String} fieldName - Name of field that should be split.
 * @param {Set<crypto.PrivateKey>} keys - Keys from owner of splitting contract.
 * @param {boolean} andSetCreator - If true set owners as creator in both contracts.
 * @return {Contract} working contract that should be register in the Universa to finish procedure.
 */
async function createSplit(c, amount, fieldName, keys, andSetCreator = false) {
    let splitFrom = c.createRevision();
    let splitTo = splitFrom.splitValue(fieldName, amount);

    for (let key of keys)
        splitFrom.keysToSignWith.add(key);

    if (andSetCreator) {
        splitTo.registerRole(new roles.RoleLink("creator", splitTo.roles.owner));
        splitFrom.registerRole(new roles.RoleLink("creator", splitTo.roles.owner));
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
    let joinTo = contract1.createRevision();

    if (contract1.state.data[fieldName] == null || contract2.state.data[fieldName] == null)
        throw new ex.IllegalArgumentError("createJoin: not found field state.data." + fieldName);

    joinTo.state.data[fieldName] = new BigDecimal(contract1.state.data[fieldName]).add(new BigDecimal(contract2.state.data[fieldName]));

    for (let key of keys)
        joinTo.keysToSignWith.add(key);

    joinTo.revokingItems.add(contract2);

    await joinTo.seal(true);

    return joinTo;
}

/**
 * Implementing join procedure.
 * Service create new revision of first contract, update amount field with sum of amount fields in the both contracts
 * and put second contract in revoking items of created new revision.
 * Given contract should have splitjoin permission for given keys.
 *
 * @param {Iterable<Contract>} contractsToJoin - One or more contracts to join into main contract
 * @param {[number | string | BigDecimal]} amountsToSplit - Array contains one or more amounts to split from main contract
 * @param {[KeyAddress]} addressesToSplit - Array contains addresses the ownership of splitted parts will be transferred to
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey> | null} ownerKeys - Owner keys of joined contracts
 * @param {string} fieldName - Name of field that should be join by
 * @return {[Contract]} list of contracts containing main contract followed by splitted parts.
 */
async function createSplitJoin(contractsToJoin, amountsToSplit, addressesToSplit, ownerKeys, fieldName) {
    let contract = null;
    let sum = new BigDecimal(0);
    for (let c of contractsToJoin) {
        if (contract == null) {
            contract = c;
            contract = contract.createRevision(ownerKeys);
        } else
            contract.revokingItems.add(c);

        if (c.state.data[fieldName] == null)
            throw new ex.IllegalArgumentError("createSplitJoin: not found field state.data." + fieldName);

        sum = sum.add(new BigDecimal(c.state.data[fieldName]));
    }

    let parts = contract.split(amountsToSplit.length);
    for (let i = 0; i < parts.length; i++) {
        sum = sum.sub(new BigDecimal(amountsToSplit[i]));
        parts[i].registerRole(new roles.SimpleRole("owner", addressesToSplit[i]));
        parts[i].state.data[fieldName] = amountsToSplit[i];

        parts[i].seal();
    }
    contract.state.data[fieldName] = sum.toFixed();
    contract.seal();

    return [contract].concat(parts);
}

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

    //twoSignContract.setOwnerKeys(toKeys);
    twoSignContract.registerRole(new roles.SimpleRole("owner", toKeys));

    await twoSignContract.seal();

    return twoSignContract;
}

/**
 * Creates a token contract for given keys with given currency code,name,description.
 * The service creates a simple token contract with issuer, creator and owner roles;
 * with change_owner permission for owner, revoke permissions for owner and issuer and split_join permission for owner.
 * Split_join permission has by default following params: "minValue" for min_value and min_unit, "amount" for field_name,
 * "state.origin" for join_match_fields.
 * By default expires at time is set to 60 months from now.
 *
 * @param {Set<crypto.PrivateKey>} issuerKeys - Issuer public keys.
 * @param {Set<crypto.PublicKey>} ownerKeys - Owner public keys.
 * @param amount    - Maximum token number.
 * @param minValue  - Minimum token value.
 * @param {String} currency - Currency code.
 * @param {String} name - Currency name.
 * @param {String} description  - Currency description.
 * @return signed and sealed contract, ready for register.
 */
async function createTokenContract( issuerKeys, ownerKeys, amount, minValue, currency, name, description) {
 /*   let tokenContract = new Contract();
    tokenContract.apiLevel= 3;

    tokenContract.definition.expiresAt = new Date(tokenContract.definition.createdAt);
    tokenContract.definition.expiresAt.setDate(tokenContract.definition.expiresAt.getMonth() + 60);

    /Binder data = new Binder();
    data.set("currency", currency);
    data.set("short_currency", currency);
    data.set("name", name);
    data.set("description", description);
    cd.setData(data);

    SimpleRole issuerRole = new SimpleRole("issuer");
    for (PrivateKey k : issuerKeys) {
        KeyRecord kr = new KeyRecord(k.getPublicKey());
        issuerRole.addKeyRecord(kr);
    }

    SimpleRole ownerRole = new SimpleRole("owner");
    for (PublicKey k : ownerKeys) {
        KeyRecord kr = new KeyRecord(k);
        ownerRole.addKeyRecord(kr);
    }

    tokenContract.registerRole(issuerRole);
    tokenContract.createRole("issuer", issuerRole);
    tokenContract.createRole("creator", issuerRole);

    tokenContract.registerRole(ownerRole);
    tokenContract.createRole("owner", ownerRole);

    tokenContract.getStateData().set("amount", amount.toString());

    RoleLink ownerLink = new RoleLink("@owner_link", "owner");
    ownerLink.setContract(tokenContract);
    ChangeOwnerPermission changeOwnerPerm = new ChangeOwnerPermission(ownerLink);
    tokenContract.addPermission(changeOwnerPerm);

    Binder params = new Binder();
    params.set("min_value", minValue.toString());
    params.set("min_unit", minValue.toString());
    params.set("field_name", "amount");
    List<String> listFields = new ArrayList<>();
    listFields.add("state.origin");
    params.set("join_match_fields", listFields);

    SplitJoinPermission splitJoinPerm = new SplitJoinPermission(ownerLink, params);
    tokenContract.addPermission(splitJoinPerm);

    RevokePermission revokePerm1 = new RevokePermission(ownerLink);
    tokenContract.addPermission(revokePerm1);

    RevokePermission revokePerm2 = new RevokePermission(issuerRole);
    tokenContract.addPermission(revokePerm2);

    tokenContract.seal();
    tokenContract.addSignatureToSeal(issuerKeys);

    return tokenContract;*/
}

/**
 * Creates a share contract for given keys.
 * The service creates a simple share contract with issuer, creator and owner roles
 * with change_owner permission for owner, revoke permissions for owner and issuer and split_join permission for owner.
 * Split_join permission has by default following params: 1 for min_value, 1 for min_unit, "amount" for field_name,
 * "state.origin" for join_match_fields.
 * By default expires at time is set to 60 months from now.
 *
 * @param issuerKeys is issuer private keys.
 * @param ownerKeys  is owner public keys.
 * @param amount     is maximum shares number.
 * @return signed and sealed contract, ready for register.
 */
/*public synchronized static Contract createShareContract(Set<PrivateKey> issuerKeys, Set<PublicKey> ownerKeys, BigDecimal amount) {
    Contract shareContract = new Contract();
    shareContract.setApiLevel(3);

    Contract.Definition cd = shareContract.getDefinition();
    cd.setExpiresAt(shareContract.getCreatedAt().plusMonths(60));

    Binder data = new Binder();
    data.set("name", "Default share name");
    data.set("currency_code", "DSH");
    data.set("currency_name", "Default share name");
    data.set("description", "Default share description.");
    cd.setData(data);

    SimpleRole issuerRole = new SimpleRole("issuer");
    for (PrivateKey k : issuerKeys) {
        KeyRecord kr = new KeyRecord(k.getPublicKey());
        issuerRole.addKeyRecord(kr);
    }

    SimpleRole ownerRole = new SimpleRole("owner");
    for (PublicKey k : ownerKeys) {
        KeyRecord kr = new KeyRecord(k);
        ownerRole.addKeyRecord(kr);
    }

    shareContract.registerRole(issuerRole);
    shareContract.createRole("issuer", issuerRole);
    shareContract.createRole("creator", issuerRole);

    shareContract.registerRole(ownerRole);
    shareContract.createRole("owner", ownerRole);

    shareContract.getStateData().set("amount", amount.toString());

    ChangeOwnerPermission changeOwnerPerm = new ChangeOwnerPermission(ownerRole);
    shareContract.addPermission(changeOwnerPerm);

    Binder params = new Binder();
    params.set("min_value", 1);
    params.set("min_unit", 1);
    params.set("field_name", "amount");
    List<String> listFields = new ArrayList<>();
    listFields.add("state.origin");
    params.set("join_match_fields", listFields);

    SplitJoinPermission splitJoinPerm = new SplitJoinPermission(ownerRole, params);
    shareContract.addPermission(splitJoinPerm);

    RevokePermission revokePerm1 = new RevokePermission(ownerRole);
    shareContract.addPermission(revokePerm1);

    RevokePermission revokePerm2 = new RevokePermission(issuerRole);
    shareContract.addPermission(revokePerm2);

    shareContract.seal();
    shareContract.addSignatureToSeal(issuerKeys);

    return shareContract;
}*/

/**
 * Creates a simple notary contract for given keys.
 * <br><br>
 * The service creates a notary contract with issuer, creator and owner roles
 * with change_owner permission for owner and revoke permissions for owner and issuer.
 * By default expires at time is set to 60 months from now.
 * <br><br>
 *
 * @param issuerKeys is issuer private keys.
 * @param ownerKeys  is owner public keys.
 * @return signed and sealed contract, ready for register.
 */
/*public synchronized static Contract createNotaryContract(Set<PrivateKey> issuerKeys, Set<PublicKey> ownerKeys) {
    Contract notaryContract = new Contract();
    notaryContract.setApiLevel(3);

    Contract.Definition cd = notaryContract.getDefinition();
    cd.setExpiresAt(notaryContract.getCreatedAt().plusMonths(60));

    Binder data = new Binder();
    data.set("name", "Default notary");
    data.set("description", "Default notary description.");
    data.set("template_name", "NOTARY_CONTRACT");
    data.set("holder_identifier", "default holder identifier");
    cd.setData(data);

    SimpleRole issuerRole = new SimpleRole("issuer");
    for (PrivateKey k : issuerKeys) {
        KeyRecord kr = new KeyRecord(k.getPublicKey());
        issuerRole.addKeyRecord(kr);
    }

    SimpleRole ownerRole = new SimpleRole("owner");
    for (PublicKey k : ownerKeys) {
        KeyRecord kr = new KeyRecord(k);
        ownerRole.addKeyRecord(kr);
    }

    notaryContract.registerRole(issuerRole);
    notaryContract.createRole("issuer", issuerRole);
    notaryContract.createRole("creator", issuerRole);

    notaryContract.registerRole(ownerRole);
    notaryContract.createRole("owner", ownerRole);

    ChangeOwnerPermission changeOwnerPerm = new ChangeOwnerPermission(ownerRole);
    notaryContract.addPermission(changeOwnerPerm);

    RevokePermission revokePerm1 = new RevokePermission(ownerRole);
    notaryContract.addPermission(revokePerm1);

    RevokePermission revokePerm2 = new RevokePermission(issuerRole);
    notaryContract.addPermission(revokePerm2);

    notaryContract.seal();
    notaryContract.addSignatureToSeal(issuerKeys);

    return notaryContract;
}*/

/**
 * Create paid transaction, which consist from contract you want to register and payment contract that will be
 * spend to process transaction.
 *
 * @param {Contract | TransactionPack} payload - Prepared contract you want to register in the Universa.
 * @param {Contract} payment - Approved contract with "U" belongs to you.
 * @param {number} amount - Number of "U" you want to spend to register payload contract.
 * @param {Set<crypto.PrivateKey> | [crypto.PrivateKey]} keys - Own private keys, which are set as owner of payment contract.
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

/**
 * Create paid transaction, which consist from prepared TransactionPack you want to register
 * and payment contract that will be spend to process transaction.
 * Included second payment.
 * It is an extension to the parcel structure allowing include additional payment field that will not be
 * registered if the transaction will fail.
 * <br><br>
 * Creates 2 U payment blocks:
 * <ul>
 * <li><i>first</i> (this is mandatory) is transaction payment, that will always be accepted, as it is now</li>
 * <li><i>second</i> extra payment block for the same U that is accepted with the transaction inside it. </li>
 * </ul>
 * Technically it done by adding second payment to the new items of payload transaction.
 * <br><br>
 * Node processing logic logic is:
 * <ul>
 * <li>if the first payment fails, no further action is taking (no changes)</li>
 * <li>if the first payments is OK, the transaction is evaluated and the second payment should be the part of it</li>
 * <li>if the transaction including the second payment is OK, the transaction and the second payment are registered altogether.</li>
 * <li>if any of the latest fail, the whole transaction is not accepted, e.g. the second payment is not accepted too</li>
 * </ul>
 * <br><br>
 *
 * @param {TransactionPack} payload - Prepared TransactionPack you want to register in the Universa.
 * @param {Contract} payment - Approved contract with "U" belongs to you.
 * @param {number} amount - Number of "U" you want to spend to register payload contract.
 * @param {number} amountSecond - Number of "U" you want to spend from second payment.
 * @param {Set<crypto.PrivateKey> | [crypto.PrivateKey]} keys - Own private keys, which are set as owner of payment contract
 * @param {boolean} withTestPayment - If true {@link Parcel} will be created with test payment
 * @return {Parcel} Parcel, it ready to send to the Universa.
 */
async function createPayingParcel(payload, payment, amount, amountSecond, keys, withTestPayment) {

    let paymentDecreased = payment.createRevision(keys);

    if (withTestPayment)
        paymentDecreased.state.data.test_transaction_units = payment.state.data.test_transaction_units - amount;
    else
        paymentDecreased.state.data.transaction_units = payment.state.data.transaction_units - amount;

    await paymentDecreased.seal(true);

    let paymentDecreasedSecond = paymentDecreased.createRevision(keys);

    if (withTestPayment)
        paymentDecreasedSecond.state.data.test_transaction_units = paymentDecreased.state.data.test_transaction_units - amountSecond;
    else
        paymentDecreasedSecond.state.data.transaction_units = paymentDecreased.state.data.transaction_units - amountSecond;

    await paymentDecreasedSecond.seal();

    // we add new item to the contract, so we need to recreate transaction pack
    let mainContract = payload.contract;
    mainContract.newItems.add(paymentDecreasedSecond);
    await mainContract.seal();
    mainContract.transactionPack.extractAllSubItemsAndReferenced(mainContract);

    return new Parcel(mainContract.transactionPack, paymentDecreased.transactionPack);
}

/**
 * Create a batch contract, which registers all the included contracts, possibily referencing each other,
 * in the single transaction, saving time and reducing U cost. Note that if any of the batched contracts
 * fails, the whole batch is rejected.
 *
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} keys - To sign batch with.
 * @param {...Contract} contracts - To register all in one batch. Should be prepared and sealed.
 * @return {Contract} batch contract that includes all contracts as new items.
 */
async function createBatch(keys, ...contracts) {
    let batch = new Contract();
    batch.registerRole(new roles.SimpleRole("issuer", keys));
    batch.registerRole(new roles.RoleLink("creator", "issuer"));
    batch.registerRole(new roles.RoleLink("owner", "issuer"));

    let expires = new Date();
    expires.setDate(expires.getDate() + 3);
    batch.setExpiresAt(expires);

    for (let c of contracts)
        batch.newItems.add(c);

    for (let k of keys)
        batch.keysToSignWith.add(k);

    await batch.seal(true);
    return batch;
}

/**
 * Update source contract so it can not be registered without valid Consent contract, created in this call.
 * To register the source contract therefore it is needed to sign the consent with all keys which addresses
 * are specified with the call, and register consent contract separately or in the same batch with the source
 * contract.
 *
 * @param {Contract} source - Contract to update. Must not be registered (new root or new revision)
 * @param {...crypto.KeyAddress} consentKeyAddresses - Addresses that are required in the consent contract.
 * Consent contract should be then signed with corresponding keys.
 * @return {Contract} Consent contract.
 */
async function addConsent(source, ...consentKeyAddresses) {
    let consent = new Contract();
    consent.registerRole(new roles.SimpleRole("issuer", consentKeyAddresses));
    consent.registerRole(new roles.RoleLink("creator", "issuer"));
    consent.registerRole(new roles.RoleLink("owner", "issuer"));
    let expires = new Date();
    expires.setDate(expires.getDate() + 10);
    consent.setExpiresAt(expires);

    let ownerLink = new roles.RoleLink("@owner_link","owner");
    consent.registerRole(ownerLink);
    consent.addPermission(new perms.RevokePermission(ownerLink));
    consent.addPermission(new perms.ChangeOwnerPermission(ownerLink));
    consent.createTransactionalSection();
    consent.transactional.id = HashId.of(randomBytes(64)).base64;

    await consent.seal(true);

    let constr = new Constraint(source);
    constr.name = "consent_" + consent.id;
    constr.type = Constraint.TYPE_TRANSACTIONAL;
    constr.transactional_id = consent.transactional.id;
    constr.signed_by.push(consent.roles.issuer);

    if (source.transactional == null)
        source.createTransactionalSection();

    source.addConstraint(constr);

    return consent;
}

/**
 * Create escrow contracts (external and internal) for a expiration period of 5 years.
 * External escrow contract includes internal escrow contract. Contracts are linked by internal escrow contract origin.
 * To internal escrow contract establishes the owner role, {@link ListRole} on the basis of the quorum of 2 of 3 roles: customer, executor and arbitrator.
 * This role is granted exclusive permission to change the value of the status field of internal escrow contract (state.data.status).
 * Possible values for the internal escrow contract status field are: opened, completed and canceled.
 *
 * If necessary, the contents and parameters (expiration period, for example) of escrow contracts
 * can be changed before sealing and registration. If internal escrow contract has changed, need re-create external
 * escrow contract by {@link ContractsService#createExternalEscrowContract(Contract, Collection)}.
 *
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} issuerKeys - Issuer escrow contract private keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} customerKeys - Customer public keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} executorKeys - Executor public keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} arbitratorKeys - Arbitrator public keys
 *
 * @return {Contract} external escrow contract
 */
async function createEscrowContract(issuerKeys, customerKeys, executorKeys, arbitratorKeys) {

    // Create internal escrow contract
    let escrow = await createInternalEscrowContract(issuerKeys, customerKeys, executorKeys, arbitratorKeys);

    // Create external escrow contract (escrow pack)
    return createExternalEscrowContract(escrow, issuerKeys);
}

/**
 * Creates internal escrow contract for a expiration period of 5 years.
 * To internal escrow contract establishes the owner role, {@link ListRole} on the basis of the quorum of 2 of 3 roles: customer, executor and arbitrator.
 * This role is granted exclusive permission to change the value of the status field of internal escrow contract (state.data.status).
 * Possible values for the internal escrow contract status field are: opened, completed and canceled.
 *
 * If necessary, the contents and parameters (expiration period, for example) of escrow contract
 * can be changed before sealing and registration. If internal escrow contract has changed, need re-create external
 * escrow contract (if used) by {@link ContractsService#createExternalEscrowContract(Contract, Collection)}.
 *
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} issuerKeys - Issuer escrow contract private keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} customerKeys - Customer public keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} executorKeys - Executor public keys
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} arbitratorKeys - Arbitrator public keys
 *
 * @return {Contract} internal escrow contract
 */
async function createInternalEscrowContract(issuerKeys, customerKeys, executorKeys, arbitratorKeys) {

    // Create internal escrow contract
    let escrow = new Contract();
    escrow.apiLevel = 4;
    escrow.definition.expiresAt = new Date(escrow.definition.createdAt);
    escrow.definition.expiresAt.setMonth(escrow.definition.expiresAt.getMonth() + 60);
    escrow.state.data.status = "opened";

    escrow.registerRole(new roles.SimpleRole("issuer", issuerKeys));
    escrow.registerRole(new roles.RoleLink("creator", "issuer"));

    // quorum role
    let quorumOwner = new roles.ListRole("owner", [
        new roles.SimpleRole("customer", customerKeys),
        new roles.SimpleRole("executor", executorKeys),
        new roles.SimpleRole("arbitrator", arbitratorKeys)
    ], roles.ListRoleMode.QUORUM, 2);

    escrow.registerRole(quorumOwner);

    let ownerLink = new roles.RoleLink("@owner_link", "owner");
    ownerLink.contract = escrow;

    // modify permission
    escrow.definition.addPermission(new perms.ModifyDataPermission(ownerLink, {fields : {status : ["completed", "canceled"]}}));

    // constraint for deny re-complete and re-cancel
    let finalizeConstr = new Constraint(escrow);
    finalizeConstr.name = "deny_re-complete_and_re-cancel";
    finalizeConstr.type =  Constraint.TYPE_EXISTING_DEFINITION;

    let conditions = {any_of : [
        "this.state.parent undefined",
        {all_of : [
            "ref.id == this.state.parent",
            "ref.state.data.status != \"completed\"",
            "ref.state.data.status != \"canceled\""
        ]}
    ]};

    finalizeConstr.setConditions(conditions);
    escrow.addConstraint(finalizeConstr);

    for (let k of issuerKeys)
        escrow.keysToSignWith.add(k);

    await escrow.seal(true);

    return escrow;
}

/**
 * Creates external escrow contract for a expiration period of 5 years.
 * External escrow contract includes internal escrow contract. Contracts are linked by internal escrow contract origin.
 *
 * If necessary, the contents and parameters (expiration period, for example) of escrow contracts
 * can be changed before sealing and registration. If internal escrow contract has changed, need re-create external
 * escrow contract by {@link ContractsService#createExternalEscrowContract(Contract, Collection)}.
 *
 * @param {Contract} internalEscrow - Internal escrow contract
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} issuerKeys - Issuer escrow contract private keys
 *
 * @return {Contract} external escrow contract
 */
async function createExternalEscrowContract(internalEscrow, issuerKeys) {

    // Create external escrow contract (escrow pack)
    let escrowPack = new Contract();
    escrowPack.apiLevel = 4;
    escrowPack.definition.expiresAt = new Date(escrowPack.definition.createdAt);
    escrowPack.definition.expiresAt.setMonth(escrowPack.definition.expiresAt.getMonth() + 60);
    escrowPack.definition.data.EscrowOrigin = internalEscrow.getOrigin().base64;

    escrowPack.registerRole(new roles.SimpleRole("issuer", issuerKeys));
    escrowPack.registerRole(new roles.RoleLink("owner", "issuer"));
    escrowPack.registerRole(new roles.RoleLink("creator", "issuer"));

    escrowPack.newItems.add(internalEscrow);

    for (let k of issuerKeys)
        escrowPack.keysToSignWith.add(k);

    await escrowPack.seal(true);

    return escrowPack;
}

/**
 * Modifies payment contract by making ready for escrow.
 * To payment contract is added {@link Transactional} section with 2 constraints: send_payment_to_executor, return_payment_to_customer.
 * The owner of payment contract is set to {@link ListRole} contains customer role with return_payment_to_customer constraint
 * and executor role with send_payment_to_executor constraint. Any of these roles is sufficient to own a payment contract.
 *
 * @param {Contract | string} escrow - Internal escrow contract to use with payment (or his origin in base64).
 * Must be returned from {@link createInternalEscrowContract}
 * @param {Contract} payment - Payment contract to update. Must not be registered (new root or new revision)
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey> | null} paymentOwnerKeys - Keys required for use payment contract
 * (usually, owner private keys). May be null, if payment will be signed later
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} customerKeys - Customer public keys of escrow contract
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} executorKeys - Executor public keys of escrow contract
 *
 * @return {Contract} payment contract ready for escrow
 */
async function modifyPaymentForEscrowContract(escrow, payment, paymentOwnerKeys, customerKeys, executorKeys) {

    let escrowOrigin;
    if (escrow instanceof Contract)
        escrowOrigin = escrow.getOrigin().base64;
    else
        escrowOrigin = escrow;

    // Build payment contracts owner role
    let customerConstr = new Constraint(payment);
    customerConstr.name = "return_payment_to_customer";
    customerConstr.type =  Constraint.TYPE_TRANSACTIONAL;
    customerConstr.setConditions({all_of : [
        "ref.origin == " + "\"" + escrowOrigin + "\"",
        "ref.state.data.status == \"canceled\""
    ]});

    let executorConstr = new Constraint(payment);
    executorConstr.name = "send_payment_to_executor";
    executorConstr.type =  Constraint.TYPE_TRANSACTIONAL;
    executorConstr.setConditions({all_of : [
        "ref.origin == " + "\"" + escrowOrigin + "\"",
        "ref.state.data.status == \"completed\""
    ]});

    let customer = new roles.SimpleRole("customer", customerKeys);
    customer.requiredAllConstraints.add(customerConstr);
    let executor = new roles.SimpleRole("executor", executorKeys);
    executor.requiredAllConstraints.add(executorConstr);

    payment.createTransactionalSection();
    payment.transactional.id = HashId.HashId.of(randomBytes(64)).base64;

    payment.addConstraint(customerConstr);
    payment.addConstraint(executorConstr);

    let paymentOwner = new roles.ListRole("owner", [customer, executor], roles.ListRoleMode.ANY);

    // Modify payment contract
    payment.registerRole(paymentOwner);

    if (paymentOwnerKeys != null)
        for (let k of paymentOwnerKeys)
            payment.keysToSignWith.add(k);

    await payment.seal();

    return payment;
}

/**
 * Checks external escrow contract and add payment contract to it.
 * To payment contract is added {@link Transactional} section with 2 constraints: send_payment_to_executor, return_payment_to_customer.
 * The owner of payment contract is set to {@link ListRole} contains customer role with return_payment_to_customer constraint
 * and executor role with send_payment_to_executor constraint. Any of these roles is sufficient to own a payment contract.
 *
 * @param {Contract} escrow - Escrow contract (external) to use with payment. Must be returned from {@link createEscrowContract}
 * @param {Contract} payment - Payment contract to update. Must not be registered (new root or new revision)
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey> | null} paymentOwnerKeys - Keys required for use payment contract
 * (usually, owner private keys). May be null, if payment will be signed later.
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} customerKeys - Customer public keys of escrow contract
 * @param {[crypto.PublicKey] | Set<crypto.PublicKey>} executorKeys - Executor public keys of escrow contract
 *
 * @return {boolean} result of checking external escrow contract and adding payment to it
 */
async function addPaymentToEscrowContract(escrow, payment, paymentOwnerKeys, customerKeys, executorKeys) {

    // Check external escrow contract
    let escrowOrigin = escrow.definition.data.EscrowOrigin;
    if (escrowOrigin == null)
        return false;

    if (!Array.from(escrow.newItems).some(c => c.getOrigin().base64 === escrowOrigin && c.state.data.status === "opened"))
        return false;

    payment = await modifyPaymentForEscrowContract(escrowOrigin, payment, paymentOwnerKeys, customerKeys, executorKeys);

    // Add payment contract to external escrow
    escrow.newItems.add(payment);
    await escrow.seal(true);

    return true;
}

/**
 * Completes escrow contract. All linked payments are made available to the executor.
 * For registration completed escrow contract require quorum of 2 of 3 roles: customer, executor and arbitrator.
 *
 * @param {Contract} escrow - Escrow contract (external or internal) to complete. Must be registered for creation new revision
 *
 * @return {Contract} completed internal escrow contract or null if error occurred
 */
async function completeEscrowContract(escrow) {

    let escrowInside = escrow;

    if (escrow.state.data.status !== "opened") {      // external escrow contract (escrow pack)
        // Find internal escrow contract in external escrow contract (escrow pack)
        let escrowOrigin = escrow.definition.data.EscrowOrigin;
        if (escrowOrigin == null)
            return null;

        escrowInside = null;
        for (let c of escrow.newItems)
            if (c.getOrigin().base64 === escrowOrigin && c.state.data.status === "opened") {
                escrowInside = c;
                break;
            }

        if (escrowInside == null)
            return null;
    }

    let revisionEscrow = escrowInside.createRevision();
    revisionEscrow.state.data.status = "completed";
    await revisionEscrow.seal(true);

    return revisionEscrow;
}

/**
 * Cancels escrow contract. All linked payments are made available to the customer.
 * For registration canceled escrow contract require quorum of 2 of 3 roles: customer, executor and arbitrator.
 *
 * @param {Contract} escrow - Escrow contract (external or internal) to cancel. Must be registered for creation new revision
 *
 * @return {Contract} canceled internal escrow contract or null if error occurred
 */
async function cancelEscrowContract(escrow) {

    let escrowInside = escrow;

    if (escrow.state.data.status !== "opened") {      // external escrow contract (escrow pack)
        // Find internal escrow contract in external escrow contract (escrow pack)
        let escrowOrigin = escrow.definition.data.EscrowOrigin;
        if (escrowOrigin == null)
            return null;

        escrowInside = null;
        for (let c of escrow.newItems)
            if (c.getOrigin().base64 === escrowOrigin && c.state.data.status === "opened") {
                escrowInside = c;
                break;
            }

        if (escrowInside == null)
            return null;
    }

    let revisionEscrow = escrowInside.createRevision();
    revisionEscrow.state.data.status = "canceled";
    await revisionEscrow.seal(true);

    return revisionEscrow;
}

/**
 * Transfers payment contract to new owner on the result of escrow.
 * Use payment contract that was added to external escrow contract by
 * {@link addPaymentToEscrowContract} or was modified by {@link modifyPaymentForEscrowContract}.
 * Executor can take the payment contract, if internal escrow contract are completed.
 * Customer can take the payment contract, if internal escrow contract are canceled.
 * For registration payment contract (returned by this method) need to add result internal escrow contract to
 * {@link TransactionPack#referencedItems}.
 *
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} newOwnerKeys - Private keys of new owner of payment
 * @param {Contract} payment - Payment contract to take by new owner. Must be registered for creation new revision
 *
 * @return {Contract} new revision of payment contract with new owner
 */
async function takeEscrowPayment(newOwnerKeys, payment) {
    let revisionPayment = payment.createRevision(newOwnerKeys);

    // set new owner
    revisionPayment.registerRole(new roles.SimpleRole("owner", newOwnerKeys));

    // remove escrow constraints from Contract.constraints (from transactional section constraints removed automatically)
    revisionPayment.constraints.delete("return_payment_to_customer");
    revisionPayment.constraints.delete("send_payment_to_executor");
    await revisionPayment.seal(true);

    return revisionPayment;
}

/**
 * Creates special contract to set unlimited requests for the {@link PublicKey}.
 * The base limit is 30 per minute (excludes registration requests).
 * Unlimited requests for 5 minutes cost 5 U.
 * Register result contract.
 *
 * @param {crypto.PublicKey} key - Key for setting unlimited requests
 * @param {Contract} payment - Approved contract with "U" belongs to you
 * @param {number} amount - Number of "U" you want to spend to set unlimited requests for key; get by {@link Config#getRateLimitDisablingPayment()}
 * @param {[crypto.PrivateKey] | Set<crypto.PrivateKey>} keys - Own private keys, which are set as owner of payment contract
 * @return {Contract} contract for setting unlimited requests to key
 */
async function createRateLimitDisablingContract(key, payment, amount, keys) {

    let unlimitContract = payment.createRevision(keys);

    unlimitContract.createTransactionalSection();
    unlimitContract.transactional.id = HashId.of(randomBytes(64)).base64;
    unlimitContract.transactional.data.unlimited_key = key.packed;

    unlimitContract.state.data.transaction_units = payment.state.data.transaction_units - amount;
    await unlimitContract.seal(true);

    return unlimitContract;
}

module.exports = {createRevocation, createParcel, createNotaryContract,checkAttachNotaryContract, createTokenContract};
