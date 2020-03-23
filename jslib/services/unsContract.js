/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const Contract = require("contract").Contract;
const permissions = require('permissions');
const Constraint = require('constraint').Constraint;
const roles = require('roles');
const t = require("tools");
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const TransactionPack = require("transactionpack").TransactionPack;
const ex = require("exceptions");

const NSmartContract = require("services/NSmartContract").NSmartContract;
const UnsName = require("services/unsName").UnsName;
const UnsRecord = require("services/unsRecord").UnsRecord;

const CONSTRAINT_CONDITION_PREFIX = "ref.state.origin==";
const CONSTRAINT_CONDITION_LEFT = "ref.state.origin";
const CONSTRAINT_CONDITION_OPERATOR = 7;       // EQUAL

class PayingAmountMissingException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class UnsContract extends NSmartContract {

    static NAMES_LIST_FIELD_NAME = "names_list";
    static REDUCED_NAMES_LIST_FIELD_NAME = "reduce_names_list";
    static DESCRIPTIONS_LIST_FIELD_NAME = "descriptions_list";

    static PREPAID_ND_FIELD_NAME = "prepaid_ND";

    static ENTRIES_FIELD_NAME = "entries";
    static SUSPENDED_FIELD_NAME = "suspended";
    static NAMES_FIELD_NAME = "names";

    constructor() {
        super();
        // Stored UNS names
        this.storedNames = [];
        // Stored UNS names
        this.storedRecords = [];
        // Calculate U paid with las revision of UNS
        this.paidU = 0;
        // All ND (names*days) prepaid from first revision (sum of all paidU, converted to ND)
        this.prepaidNameDays = 0;
        // Need origins of referenced contracts
        this.originContracts = new t.GenericMap();
    }

    /**
     * Create a default empty new UNS contract using a provided key as issuer and owner and sealer.
     * <p>
     * This constructor adds key as sealing signature so it is ready to {@link #seal()} just after construction, thought
     * it is necessary to put real data to it first. It is allowed to change owner, expiration and data fields after
     * creation (but before sealing).
     *
     * @param {PrivateKey} key is {@link PrivateKey} for creating roles "issuer", "owner", "creator" and sign contract.
     *
     * @return {UnsContract} created UNS contract.
     */
    static fromPrivateKey(key) {
        let c = Contract.fromPrivateKey(key, new UnsContract());

        let revokePerm1 = new permissions.RevokePermission(new roles.RoleLink("@owner", "owner", c));
        c.definition.addPermission(revokePerm1);

        let revokePerm2 = new permissions.RevokePermission(new roles.RoleLink("@issuer", "issuer", c));
        c.definition.addPermission(revokePerm2);

        c.addUnsSpecific();
        return c;
    }

    /**
     * Extract UNS contract from v2 or v3 sealed form, getting revoking and new items from the transaction pack supplied.
     * If the transaction pack fails to resolve a link, no error will be reported - not sure it's a good idea.
     * If need, the exception could be generated with the transaction pack.
     * <p>
     * It is recommended to call {@link #check()} after construction to see the errors.
     *
     * @param {Uint8Array} sealed binary sealed contract.
     * @param {TransactionPack} pack the transaction pack to resolve dependencies again.
     *
     * @return {UnsContract} extracted UNS contract.
     */
    static async fromSealedBinary(sealed, pack) {
        let c = await Contract.fromSealedBinary(sealed, pack, new UnsContract());

        await c.deserializeForUns();
        return c;
    }

    /**
     * Method creates {@link UnsContract} contract from dsl file where contract is described.
     *
     * @param {string} fileName is path to dsl file with yaml structure of data for contract.
     *
     * @return {Promise<UnsContract>} created and ready {@link UnsContract} contract.
     */
    static fromDslFile(fileName) {
        return Contract.fromDslFile(fileName, new UnsContract());
    }

    /**
     * Method calls from {@link UnsContract#fromDslFile(String)} and initialize contract from given root object.
     *
     * @param {Object} root object with initialized data.
     *
     * @return {UnsContract} created and ready {@link UnsContract} contract.
     */
    initializeWithDsl(root) {
        super.initializeWithDsl(root);

        let arrayNames = root.state.data[UnsContract.NAMES_FIELD_NAME];
        arrayNames.forEach(name => {
            let unsName = new UnsName();
            this.storedNames.push(unsName.initializeWithDsl(name));
        });

        let arrayRecords = root.state.data[UnsContract.ENTRIES_FIELD_NAME];
        arrayRecords.forEach(record => {
            let unsRecord = new UnsRecord();
            this.storedRecords.push(unsRecord.initializeWithDsl(record));
        });

        return this;
    }

    async deserialize(data, deserializer) {
        await super.deserialize(data, deserializer);

        await this.deserializeForUns();
    }

    /**
     * Extract values from deserialized object for UNS fields.
     */
    async deserializeForUns() {
        let names = t.getOrDefault(this.state.data, UnsContract.NAMES_LIST_FIELD_NAME, null);
        let reduced_names = t.getOrDefault(this.state.data, UnsContract.REDUCED_NAMES_LIST_FIELD_NAME, null);
        let descriptions = t.getOrDefault(this.state.data, UnsContract.DESCRIPTIONS_LIST_FIELD_NAME, null);

        this.storedNames = [];
        for (let i = 0; i < names.length; i++) {
            let unsName = new UnsName(names[i], descriptions[i]);
            unsName.unsReducedName = reduced_names[i];
            this.storedNames.push(unsName);
        }

        this.storedRecords = t.getOrDefault(this.state.data, UnsContract.ENTRIES_FIELD_NAME, null);

        this.paidU = t.getOrDefault(this.state.data, UnsContract.PAID_U_FIELD_NAME, 0);
        this.prepaidNameDays = t.getOrDefault(this.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
    }

    /**
     * Initialize UnsContract internal data structure with specific UNS1 parameters.
     */
    addUnsSpecific() {
        this.definition.extendedType = NSmartContract.SmartContractType.UNS1;

        let ownerLink = new roles.RoleLink("owner_link", "owner", this);
        this.registerRole(ownerLink);

        let fieldsMap = {};
        fieldsMap["action"] = null;
        fieldsMap["/expires_at"] = null;
        fieldsMap["/references"] = null;
        fieldsMap[UnsContract.NAMES_FIELD_NAME] = null;
        fieldsMap[UnsContract.PAID_U_FIELD_NAME] = null;
        fieldsMap[UnsContract.PREPAID_ND_FIELD_NAME] = null;
        fieldsMap[UnsContract.NAMES_LIST_FIELD_NAME] = null;
        fieldsMap[UnsContract.REDUCED_NAMES_LIST_FIELD_NAME] = null;
        fieldsMap[UnsContract.DESCRIPTIONS_LIST_FIELD_NAME] = null;

        let modifyDataPermission = new permissions.ModifyDataPermission(ownerLink, {fields : fieldsMap});
        modifyDataPermission.id = "modify_all";
        this.definition.addPermission(modifyDataPermission);

        let refNodeConfigNameService = new Constraint(this);
        refNodeConfigNameService.name = "ref_node_config_name_service";
        refNodeConfigNameService.setConditions({any_of: [
                "ref.tag==\"" + TransactionPack.TAG_PREFIX_RESERVED + "node_config_contract\"",
                "this can_play ref.state.roles.name_service"
            ]
        });

        this.addConstraint(refNodeConfigNameService);

        let nameService = new roles.SimpleRole("name_service", null, this);
        nameService.requiredAllConstraints.add("ref_node_config_name_service");
        this.registerRole(nameService);

        fieldsMap = {};
        fieldsMap[UnsContract.REDUCED_NAMES_LIST_FIELD_NAME] = null;
        fieldsMap[UnsContract.PREPAID_ND_FIELD_NAME] = null;
        fieldsMap[UnsContract.SUSPENDED_FIELD_NAME] = null;

        modifyDataPermission = new permissions.ModifyDataPermission(new roles.RoleLink("@ns", "name_service", this), {fields : fieldsMap});
        modifyDataPermission.id = "modify_reduced";
        this.definition.addPermission(modifyDataPermission);

        let revokePermission = new permissions.RevokePermission(ownerLink);
        this.definition.addPermission(revokePermission);

        let revokePermissionNS = new permissions.RevokePermission(new roles.RoleLink("@ns", "name_service", this));
        this.definition.addPermission(revokePermissionNS);
    }

    async seal(isTransactionRoot = false) {
        if (this.paidU == null)
            throw new PayingAmountMissingException("Use setPayingAmount to manually provide the amount to be payed for this NSmartContract");

        this.saveNamesAndRecordsToState();
        this.saveOriginConstraintsToState();
        this.calculatePrepaidNameDays(true);

        //TODO: add hold duration to info provider and get it from there
        let nameExpires = new Date(this.getCurrentUnsExpiration().getTime() + 30*24*3600000);
        nameExpires.setMilliseconds(0);
        if (this.getExpiresAt().getTime() < nameExpires.getTime())
            this.setExpiresAt(new Date(nameExpires.getTime() + 10*24*3600000));

        let res = await super.seal(isTransactionRoot);

        if (this.transactionPack == null)
            this.transactionPack = new TransactionPack(this);
        Array.from(this.originContracts.values()).forEach(oc => this.transactionPack.addReferencedItem(oc));
        return res;
    }

    /**
     * Get expiration date of names associated with UNS1 contract.
     *
     * @return {Date} expiration date
     */
    getCurrentUnsExpiration() {
        // get number of entries
        let entries = this.getStoredUnitsCount();
        if (entries === 0)
            return this.getCreatedAt();

        return new Date(this.getCreatedAt().getTime() + (this.prepaidNameDays / entries) * 24 * 3600000);
    }

    getStoredUnitsCount() {
        return this.storedNames.length;
    }

    /**
     * It is private method that looking for U contract in the new items of this UNS contract. Then calculates
     * new payment, looking for already paid, summarize it and calculate new prepaid period for UNS names registration,
     * that sets to {@link UnsContract#prepaidNameDays}. This field is measured in the names*days, means how many
     * names registered for how many days.
     * But if withSaveToState param is false, calculated value do not saving to state.
     * It is useful for checking set state.data values.
     * <br><br> Additionally will be calculated new times of payment refilling, and storing info for previous revision of UNS.
     * It is also useful for UNS contract checking.
     * @param {boolean} withSaveToState if true, calculated values is saving to state.data
     */
    calculatePrepaidNameDays(withSaveToState) {

        this.paidU = this.getPaidU();

        let parentContract = this.getRevokingItem(this.state.parent);
        let prepaidNameDaysLeft = 0;
        if (parentContract != null) {
            prepaidNameDaysLeft = t.getOrDefault(parentContract.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
            prepaidNameDaysLeft -= parentContract.getStoredUnitsCount() *
                Math.floor((this.getCreatedAt().getTime() - parentContract.getCreatedAt().getTime()) / 1000) / (3600*24);
        }

        this.prepaidNameDays = prepaidNameDaysLeft + this.paidU * Number(this.getRate());

        if (withSaveToState) {
            this.state.data[UnsContract.PAID_U_FIELD_NAME] = this.paidU;
            this.state.data[UnsContract.PREPAID_ND_FIELD_NAME] = this.prepaidNameDays;
        }

        return this.prepaidNameDays;
    }

    /**
     * Checking of the constraint condition contains a comparison with the specified origin.
     *
     * @param {object} condition - object with parsed condition.
     * @param {HashId} origin - origin for comparison.
     * @return {boolean} true if origin condition.
     */
    static isOriginCondition(condition, origin) {
        return condition.operator === CONSTRAINT_CONDITION_OPERATOR &&
            condition.leftOperand != null && condition.leftOperand === CONSTRAINT_CONDITION_LEFT &&
            condition.rightOperand != null && condition.rightOperand === origin.base64;
    }

    /**
     * Save constraints with origin conditions to state.
     */
    saveOriginConstraintsToState() {
        let origins = this.getOrigins();
        let constraintsToRemove = new t.GenericSet();

        let parentContract = this.getRevokingItem(this.state.parent);
        if (parentContract != null)
            parentContract.getOrigins().forEach(oldOrigin => origins.delete(oldOrigin));

        Array.from(this.constraints.values()).forEach(constr => {
            if (constr.conditions.hasOwnProperty(Constraint.conditionsModeType.all_of))
                constr.conditions[Constraint.conditionsModeType.all_of].forEach(condition => {
                    if (condition.operator === CONSTRAINT_CONDITION_OPERATOR && condition.leftOperand != null &&
                        condition.leftOperand === CONSTRAINT_CONDITION_LEFT && condition.rightOperand != null) {
                        let origin = crypto.HashId.withDigest(condition.rightOperand);
                        if (!origins.has(origin))
                            constraintsToRemove.add(constr);
                    }
                });
        });

        constraintsToRemove.forEach(constr => this.removeConstraint(constr));

        origins.forEach( origin => {
            if (!this.isOriginConstraintExists(origin))
                this.addOriginConstraint(origin);
        });
    }

    /**
     * Save UNS names to state.
     */
    saveNamesAndRecordsToState() {
        this.state.data[UnsContract.NAMES_LIST_FIELD_NAME] = this.storedNames.map(n => n.unsName);
        this.state.data[UnsContract.REDUCED_NAMES_LIST_FIELD_NAME] = this.storedNames.map(n => n.unsReducedName);
        this.state.data[UnsContract.DESCRIPTIONS_LIST_FIELD_NAME] = this.storedNames.map(n => n.unsDescription);
        this.state.data[UnsContract.ENTRIES_FIELD_NAME] = this.storedRecords;
    }

    /**
     * Checking of the constraints contains a condition with the specified origin.
     *
     * @param {HashId} origin.
     */
    isOriginConstraintExists(origin) {
        return Array.from(this.constraints.values()).some(c => c.conditions.hasOwnProperty(Constraint.conditionsModeType.all_of) &&
            c.conditions[Constraint.conditionsModeType.all_of].some(cond => UnsContract.isOriginCondition(cond, origin)));
    }

    /**
     * Add new constraint include condition with the specified origin.
     *
     * @param {HashId} origin.
     */
    addOriginConstraint(origin) {
        let c = new Constraint(this);
        c.type = Constraint.TYPE_EXISTING_STATE;
        c.name = origin.toString();

        let conditions = {};
        conditions[Constraint.conditionsModeType.all_of] = [CONSTRAINT_CONDITION_PREFIX + "\"" + origin.base64 + "\""];
        c.setConditions(conditions);

        if (this.originContracts.has(origin))
            c.addMatchingItem(this.originContracts.get(origin));

        this.addConstraint(c);
    }

    /**
     * Callback called by the node before registering the UNS-contract for his check.
     *
     * @param {ImmutableEnvironment} c is {@link ImmutableEnvironment} object with some data.
     * @return {boolean} check result.
     */
    beforeCreate(c) {
        return this.checkPaymentAndRelatedFields(false) && this.additionallyUnsCheck(c);
    }

    /**
     * Callback called by the node before registering new revision of the UNS-contract for his check.
     *
     * @param {ImmutableEnvironment} c is {@link ImmutableEnvironment} object with some data.
     * @return {boolean} check result.
     */
    beforeUpdate(c) {
        return this.checkPaymentAndRelatedFields(true) && this.additionallyUnsCheck(c);
    }

    /**
     * Callback called by the node before revocation the UNS-contract for his check.
     *
     * @param {ImmutableEnvironment} c is {@link ImmutableEnvironment} object with some data.
     * @return {boolean} check result.
     */
    beforeRevoke(c) {
        return true;
    }

    checkPaymentAndRelatedFields(allowNoPayment) {
        let paymentCheck = true;

        this.paidU = this.getPaidU();

        if (this.paidU === 0) {
            if (!allowNoPayment) {
                if (this.getPaidU(true) > 0)
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "",
                        "Test payment is not allowed for storing names"));
                paymentCheck = false;
            }
        } else if (this.paidU < this.getMinPayment()) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "",
                "Payment for UNS contract is below minimum level of " + this.getMinPayment() + "U"));
            paymentCheck = false;
        }

        if (!paymentCheck) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "UNS contract hasn't valid payment"));
            return false;
        }

        if (this.paidU !== t.getOrDefault(this.state.data, UnsContract.PAID_U_FIELD_NAME, 0)) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Wrong [state.data." + UnsContractPAID_U_FIELD_NAME + "] value",
                "Should be amount of U paid by current paying parcel."));
            return false;
        }

        this.calculatePrepaidNameDays(false);

        // check that payment was not hacked
        if (this.prepaidNameDays !== t.getOrDefault(this.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0)) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Wrong [state.data." + UnsContract.PREPAID_ND_FIELD_NAME + "] value",
                "Should be sum of early prepaid name days left and prepaid name days of current revision. " +
                "Make sure contract was prepared using correct UNS1 rate."));
            return false;
        }

        return true;
    }

    /**
     * Additionally check the UNS-contract.
     *
     * @param {ImmutableEnvironment} ime is {@link ImmutableEnvironment} object with some data.
     * @return {boolean} check result.
     */
    additionallyUnsCheck(ime) {
        if (ime == null) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "Environment should be not null"));
            return false;
        }

        let newNames = new Map();
        this.storedNames.forEach(un => newNames.set(un.unsName, un));

        try {
            ime.nameRecords().forEach(nameRecord => {
                let unsName = newNames.get(nameRecord.getName());
                if (unsName != null && unsName.equalsTo(nameRecord))
                    newNames.remove(nameRecord.getName());
            });
        } catch (err) {
            console.error(err.message);
            console.error(err.stack);
        }

        let newRecords = new t.GenericSet(this.storedRecords);
        ime.nameRecordEntries().forEach(nre => {
            let ur = Array.from(newRecords).filter(unsRecord => unsRecord.equalsTo(nre));
            if (ur.length > 0)
                newRecords.delete(ur[0]);
        });

        if (this.definition.extendedType !== NSmartContract.SmartContractType.UNS1) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "definition.extended_type",
                "illegal value, should be " + NSmartContract.SmartContractType.UNS1 + " instead " + this.definition.extendedType));
            return false;
        }

        if (this.storedNames.length === 0) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME, "Names for storing is missing"));
            return false;
        }

        if (!newRecords.every(unsRecord => {
            if (unsRecord.unsOrigin != null) {
                if (unsRecord.unsAddresses.length > 0) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to origin AND addresses. Should be either origin or addresses"));
                    return false;
                }

                if (unsRecord.unsData != null) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to origin AND data found. Should be either origin or addresses or data"));
                    return false;
                }

                //check reference exists in contract (ensures that matching contract was checked by system for being approved)
                if (!this.isOriginConstraintExists(unsRecord.unsOrigin)) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to origin " + unsRecord.unsOrigin.toString() +
                        " but no corresponding reference is found"));
                    return false;
                }

                let matchingContracts = [];
                if (this.transactionPack != null && this.transactionPack.referencedItems.size > 0)
                    matchingContracts = Array.from(this.transactionPack.referencedItems.values()).filter(contract =>
                        contract.id.equals(unsRecord.unsOrigin) || contract.getOrigin() != null && contract.getOrigin().equals(unsRecord.unsOrigin));

                if (matchingContracts.length === 0) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to origin " + unsRecord.unsOrigin.toString() +
                        " but no corresponding referenced contract is found"));
                    return false;
                }

                if (!matchingContracts[0].roles.issuer.isAllowedForKeys(this.effectiveKeys.keys())) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to origin " + unsRecord.unsOrigin.toString() +
                        ". UNS1 contract should be also signed by this contract issuer key."));
                    return false;
                }

                return true;
            }

            if (unsRecord.unsAddresses.length > 0) {
                if (unsRecord.unsData != null) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "record referencing to addresses AND data found. Should be either origin or addresses or data"));
                    return false;
                }

                if (unsRecord.unsAddresses.length > 2)
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "Addresses list should not be contains more 2 addresses"));

                if (unsRecord.unsAddresses.length === 2 && unsRecord.unsAddresses[0].base64.length === unsRecord.unsAddresses[1].base64.length)
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "Addresses list may only contain one short and one long addresses"));

                if (!unsRecord.unsAddresses.every(keyAddress =>
                    Array.from(this.effectiveKeys.keys()).some(key => keyAddress.match(key)))) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "Address used is missing corresponding key UNS contract signed with."));
                    return false;
                }
            }

            if (unsRecord.unsData == null) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                    "Record is empty. Should reference to either origin or addresses or data"));
                return false;
            }

            return true;
        }))
            return false;

        //only check name service signature is there are new/changed name->reduced
        if (newNames.size > 0 && !this.getAdditionalKeysToSignWith().every(ak =>
             Array.from(this.effectiveKeys.keys()).some(ek => ek.equals(ak)))) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                "Authorized name service signature is missing"));
            return false;
        }

        let reducedNamesToCkeck = this.getReducedNamesToCheck();
        let originsToCheck = this.getOriginsToCheck();
        let addressesToCheck = this.getAddressesToCheck();

        let allocationErrors = ime.tryAllocate(reducedNamesToCkeck, originsToCheck, addressesToCheck);
        if (allocationErrors.length > 0) {
            allocationErrors.forEach(err => this.errors.push(err));
            return false;
        }

        return true;
    }

    getReducedNamesToCheck() {
        let reducedNames = new Set(this.storedNames.map(sn => sn.unsReducedName));

        this.revokingItems.forEach(revoked => this.removeRevokedNames(revoked, reducedNames));

        return Array.from(reducedNames);
    }

    removeRevokedNames(contract, set) {
        if (contract instanceof UnsContract)
            contract.storedNames.forEach(sn => set.delete(sn.unsReducedName));

        contract.revokingItems.forEach(revoked => this.removeRevokedNames(revoked, set));
    }

    getOriginsToCheck() {
        let origins = new t.GenericSet();
        this.storedRecords.forEach(sr => {
            if (sr.unsOrigin != null)
                origins.add(sr.unsOrigin);
        });

        this.revokingItems.forEach(revoked => this.removeRevokedOrigins(revoked, origins));

        return Array.from(origins);
    }

    removeRevokedOrigins(contract, set) {
        if (contract instanceof UnsContract)
            contract.storedRecords.forEach(sr => {
                if (sr.unsOrigin != null)
                    set.delete(sr.unsOrigin);
            });

        contract.revokingItems.forEach(revoked => this.removeRevokedOrigins(revoked, set));
    }

    getAddressesToCheck() {
        let addresses = new Set();
        this.storedRecords.forEach(sr =>
            sr.unsAddresses.forEach(ka => addresses.add(ka.toString())));

        this.revokingItems.forEach(revoked => this.removeRevokedAddresses(revoked, addresses));

        return Array.from(addresses);
    }

    removeRevokedAddresses(contract, set) {
        if (contract instanceof UnsContract)
            contract.storedRecords.forEach(sr =>
                sr.unsAddresses.forEach(ka => set.remove(ka.toString())));

        contract.revokingItems.forEach(revoked => this.removeRevokedAddresses(revoked, set));
    }

    /**
     * Callback called by the node after registering the UNS-contract.
     *
     * @param {MutableEnvironment} me is {@link MutableEnvironment} object with some data.
     * @return {Object} object contains operation status.
     */
    onCreated(me) {
        this.calculatePrepaidNameDays(false);
        let expiresAt = this.getCurrentUnsExpiration();
        this.storedNames.forEach(sn => me.createNameRecord(sn, expiresAt));
        this.storedRecords.forEach(sr => me.createNameRecordEntry(sr));
        return {status : "ok"};
    }

    /**
     * Callback called by the node after registering new revision of the UNS-contract.
     *
     * @param {MutableEnvironment} me is {@link MutableEnvironment} object with some data.
     * @return {Object} object contains operation status.
     */
    onUpdated(me) {
        this.calculatePrepaidNameDays(false);

        let expiresAt = this.getCurrentUnsExpiration();

        let newNames = new Map();
        this.storedNames.forEach(sn => newNames.set(sn.unsName, sn));

        me.nameRecords().forEach(nameRecord => {
            let unsName = newNames.get(nameRecord.getName());
            if (unsName != null && unsName.equalsTo(nameRecord)) {
                me.setNameRecordExpiresAt(nameRecord, expiresAt);
                newNames.delete(nameRecord.getName());
            } else
                me.destroyNameRecord(nameRecord);
        });

        Array.from(newNames.values()).forEach(sn => me.createNameRecord(sn, expiresAt));

        let newRecords = new t.GenericSet(this.storedRecords);
        me.nameRecordEntries().forEach(nre => {
            let ur = Array.from(newRecords).filter(unsRecord => unsRecord.equalsTo(nre));
            if (ur.length > 0)
                newRecords.delete(ur[0]);
            else
                me.destroyNameRecordEntry(nre);
        });

        newRecords.forEach(sr => me.createNameRecordEntry(sr));

        return {status : "ok"};
    }

    /**
     * Callback called by the node after revocation the UNS-contract.
     *
     * @param {ImmutableEnvironment} ime is {@link ImmutableEnvironment} object with some data.
     */
    onRevoked(ime) {}

    /**
     * Creates {@see Object} that will be returned to client after UNS-contract have been approved.
     * Contains UNS names expiration time.
     *
     * @return {Object}
     */
    getExtraResultForApprove() {
        return {expires_at : Math.floor(this.getCurrentUnsExpiration().getTime() / 1000)};
    }

    /**
     * If {@link UnsName} references to origin contract, this contract should be placed into UnsContract with this method.
     *
     * @param {Contract} contract - origin contract.
     */
    addOriginContract(contract) {
        this.originContracts.set(contract.getOrigin(), contract);
    }

    /**
     * Add name to be register by UNS1 contract
     *
     * @param {string} name - name to register
     * @param {string} reducedName - reduced version of registered name (verified by name service)
     * @param {string} description - description of name
     */
    addName(name, reducedName, description) {
        let exists = this.storedNames.filter(unsName => unsName.unsReducedName.equals(reducedName));
        if (exists.length > 0)
            throw new ex.IllegalArgumentError("Name '" + name + "'/'" + reducedName +"' already exists");

        let un = new UnsName(name, description);
        un.unsReducedName = reducedName;
        this.storedNames.push(un);
    }

    /**
     * Remove {@link UnsName} record from names collection of stored by this UnsContract.
     *
     * @param {string} name of removing unsName record.
     */
    removeName(name) {
        for (let i = 0; i < this.storedNames.length; i++)
            if (this.storedNames[i].unsName === name) {
                this.storedNames.splice(i, 1);
                return;
            }
    }

    /**
     * Returns {@link UnsName} record by it's name.
     *
     * @param {string} name of unsName record.
     * @return {UnsName | null} unsName record or null if not found.
     */
    getName(name) {
        for (let unsName of this.storedNames)
            if (unsName.unsName === name)
                return unsName;

        return null;
    }

    /**
     * Get all names registered by UNS1 contract
     * @return {Set<string>} names
     */
    getNames() {
        return new Set(this.storedNames.map(unsName => unsName.unsName));
    }

    /**
     * Get all origins registered by UNS1 contract
     *
     * @return {Set} origins
     */

    getOrigins() {
        return new t.GenericSet(this.storedRecords.map(unsRecord => unsRecord.unsOrigin).filter(unsRecord => unsRecord != null));
    }

    /**
     * Add origin to be registered by UNS1 contract
     *
     * @param {Contract} contract - contract whose origin is registered. Contract is added to UNS1 referenced items.
     */

    addOriginFromContract(contract) {
        this.addOrigin(contract.getOrigin());
        this.originContracts.put(contract.getOrigin(), contract);
    }

    /**
     * Add origin to be registered by UNS1 contract
     *
     * @param {HashId} origin to be registered. Corresponding contract must be added to referenced items of transaction manually
     */
    addOrigin(origin) {
        let exists = this.storedRecords.filter(unsRecord => unsRecord.unsOrigin != null && unsRecord.unsOrigin.equals(origin));
        if (exists.length > 0)
            throw new ex.IllegalArgumentError("Origin '" + origin + "' already exists");

        this.storedRecords.push(UnsRecord.fromOrigin(origin));
    }

    /**
     * Remove origin from the list of origins registered by UNS1 contract
     * @param {HashId} origin to be removed
     */
    removeOrigin(origin) {
        for (let i = 0; i < this.storedRecords.length; i++)
            if (this.storedRecords[i].unsOrigin != null && this.storedRecords[i].unsOrigin.equals(origin)) {
                this.storedRecords.splice(i, 1);
                return;
            }
    }

    addKey(publicKey) {
        let addresses = this.getAddresses();
        if (addresses.has(publicKey.shortAddress) && addresses.has(publicKey.longAddress))
            throw new ex.IllegalArgumentError("Key addresses '" + publicKey.longAddress + "'/'" + publicKey.shortAddress + "' already exist");

        let records = this.storedRecords.filter(unsRecord => unsRecord.unsAddresses.includes(publicKey.shortAddress) ||
            unsRecord.unsAddresses.includes(publicKey.longAddress));
        if (records.length > 0)
            for (let i = 0; i < this.storedRecords.length; i++)
                if (this.storedRecords[i].equal(records[0]))
                    this.storedRecords.splice(i, 1);

        this.storedRecords.push(UnsRecord.fromKey(publicKey));
    }

    addAddress(keyAddress) {
        let addresses = this.getAddresses();
        if (addresses.has(keyAddress))
            throw new ex.IllegalArgumentError("Key address '" + keyAddress +  "' already exist");

        this.storedRecords.push(UnsRecord.fromAddress(keyAddress));
    }

    getAddresses() {
        let result = new t.GenericSet();
        this.storedRecords.forEach(unsRecord => unsRecord.unsAddresses.forEach(unsAddress => result.add(unsAddress)));
        return result;
    }

    removeAddress(keyAddress) {
        for (let i = 0; i < this.storedRecords.length; i++)
            if (this.storedRecords[i].unsAddresses.some(unsAddress => unsAddress.equals(keyAddress))) {
                this.storedRecords.splice(i, 1);
                return;
            }
    }

    removeKey(publicKey) {
        for (let i = 0; i < this.storedRecords.length; i++)
            if (this.storedRecords[i].unsAddresses.some(unsAddress => unsAddress.equals(publicKey.shortAddress) ||
                unsAddress.equals(publicKey.longAddress))) {
                this.storedRecords.splice(i, 1);
                return;
            }
    }

    copy() {
        //create revision should drop paidU value
        let c = super.copy();
        c.paidU = null;
        return c;
    }

    addData(data) {
        this.storedRecords.push(UnsRecord.fromData(data));
    }

    getAllData() {
        return this.storedRecords.map(unsRecord => unsRecord.unsData).filter(unsData => unsData != null);
    }

    removeData(data) {
        for (let i = 0; i < this.storedRecords.length; i++)
            if (this.storedRecords[i].unsData != null && this.storedRecords[i].unsData.equals(data)) {
                this.storedRecords.splice(i, 1);
                return;
            }
    }

    //TODO: payments

    /**
     * Get amount of U to be payed additionally to achieve desired UNS1 expiration date.
     *
     * Note: UNS1 expiration date is related to names services expiration
     * only and has nothing with {@link Contract} expiration. {@link Contract} expiration
     * can be set by its owner freely. It is only automatically adjusted if it's less
     * than: names services expiration date + HOLD period (one month) + 10 days
     *
     * @param {Date} unsExpirationDate - Desired expiration data.
     * @return {number} amount of U to be payed. Can be zero if no additional payment is required.
     */
    getPayingAmount(unsExpirationDate) {
        let nameDaysShouldBeValidFor = this.getStoredUnitsCount() *
            Math.floor((unsExpirationDate.getTime() - this.getCreatedAt().getTime()) / 1000) / (3600*24);

        let parentContract = this.getRevokingItem(this.state.parent);

        let prepaidNameDaysLeft = 0;

        if(parentContract != null) {
            prepaidNameDaysLeft = t.getOrDefault(parentContract.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
            prepaidNameDaysLeft -= parentContract.getStoredUnitsCount() *
                Math.floor((this.getCreatedAt().getTime() - parentContract.getCreatedAt().getTime()) / 1000) / (3600*24);
        }

        nameDaysShouldBeValidFor -= prepaidNameDaysLeft;

        let amount = Math.ceil(nameDaysShouldBeValidFor / Number(this.getRate()));

        if(amount <= 0) {
            return 0;
        }

        if(amount < this.getMinPayment()) {
            return this.getMinPayment();
        }

        return amount;
    }

    /**
     * Get expiration date of current UNS1 if being payed additionally by specified amount.
     * If parent contract exists its paid time remaining will be taken into account.
     *
     * Note: UNS1 expiration date is related to names services expiration
     * only and has nothing with {@link Contract} expiration. {@link Contract} expiration
     * can be set by its owner freely. It is only automatically adjusted if it's less
     * than: names services expiration date + HOLD period (one month) + 10 days.
     *
     * @param {number} payingAmount - Paying amount.
     * @return {Date} calculated UNS1 expiration date or {@code null} if amount passed is less than {@link #getMinPayment()}.
     */
    getUnsExpiration(payingAmount) {
        if(payingAmount === 0 && this.state.revision === 1 || payingAmount > 0 && payingAmount < this.getMinPayment()) {
            return null;
        }

        let parentContract = this.getRevokingItem(this.state.parent);

        let prepaidNameDaysLeft = 0;

        if(parentContract != null) {
            prepaidNameDaysLeft = t.getOrDefault(parentContract.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
            prepaidNameDaysLeft -= parentContract.getStoredUnitsCount() *
                Math.floor((this.getCreatedAt().getTime() - parentContract.getCreatedAt().getTime()) / 1000) / (3600*24);
        }

        let days = (payingAmount * Number(this.getRate()) + prepaidNameDaysLeft) / this.getStoredUnitsCount();

        return new Date(this.getCreatedAt().getTime() + (days) * 24 * 3600000);
    }

    /**
     * Get expiration date of current UNS1 if being payed additionally by minimum amount possible.
     * If parent contract exists its paid time remaining will be taken into account.
     *
     * Note: UNS1 expiration date is related to names services expiration
     * only and has nothing with {@link Contract} expiration. {@link Contract} expiration
     * can be set by its owner freely. It is only automatically adjusted if it's less
     * than: names services expiration date + HOLD period (one month) + 10 days.
     *
     * @return {Date} calculated UNS1 expiration date.
     */
    getMinUnsExpiration() {
        return this.getUnsExpiration(this.getMinPayment());
    }

    /**
     * Create {@link Parcel} to be registered that ensures expiration date of current UNS1 is not less than desired one.
     *
     * @param {Date} unsExpirationDate - Desired expiration date.
     * @param {Contract} uContract - Contract to used as payment.
     * @param {} uKeys - Keys that resolve owner of
     * payment contract.
     * @param {Array<crypto.PrivateKey>|Set<crypto.PrivateKey>|crypto.PrivateKey}keysToSignUnsWith keys to sign UNS1 contract
     * with (existing signatures are dropped when adding payment).
     * @return {Parcel} parcel to be registered.
     */
    createRegistrationParcelFromExpirationDate(unsExpirationDate, uContract, uKeys, keysToSignUnsWith) {
        let amount = this.getPayingAmount(unsExpirationDate);

        return this.createRegistrationParcelFromPaymentAmount(amount, uContract, uKeys, keysToSignUnsWith);
    }

    /**
     * Create {@link Parcel} to be registered that includes given amount paid.
     *
     * @param {number} payingAmount - Paying amount to pay.
     * @param {Contract} uContract - Contract to used as payment.
     * @param {} uKeys - Keys that resolve owner of
     * payment contract.
     * @param {Array<crypto.PrivateKey>|Set<crypto.PrivateKey>|crypto.PrivateKey} keysToSignUnsWith - Keys to sign UNS1
     * contract with (existing signatures are dropped when adding payment).
     * @return {Parcel} parcel to be registered.
     */
    async createRegistrationParcelFromPaymentAmount(payingAmount, uContract, uKeys, keysToSignUnsWith) {
        if(this.paidU == null || payingAmount !== this.paidU) {

            if(this.setPayingAmount(payingAmount) == null) {
                return null;
            }

            await this.seal();

            await this.addSignatureToSeal(keysToSignUnsWith);
        }

        return Parcel.of(this, uContract, uKeys,payingAmount);
    }

    /**
     * Create {@link Parcel} to be registered that includes additional payment of size expected by UNS1 contract: {@link #getPayingAmount()}.
     *
     * Using this method allows to create paying parcel for UNS1 contract without dropping its signatures.
     *
     * @param {Contract} uContract - Contract to used as payment.
     * @param {} uKeys - Keys that resolve owner of payment contract.
     * @return {Parcel} parcel to be registered.
     */
    createRegistrationParcel(uContract, uKeys) {
        return Parcel.of(this, uContract, uKeys, this.paidU);
    }

    /**
     * Sets an amount that is going to be paid for this UNS1.
     *
     * Note: UNS1 expiration date is related to names services expiration
     * only and has nothing with {@link Contract} expiration. {@link Contract} expiration
     * can be set by its owner freely. It is only automatically adjusted if it's less
     * than: names services expiration date + HOLD period (one month) + 10 days.
     *
     * @param {number} payingAmount - Paying amount that is going to be paid.
     * @return {Date} calculated UNS1 expiration date.
     */
    setPayingAmount(payingAmount) {
        if(payingAmount === 0 && this.state.revision === 1 || payingAmount > 0 && payingAmount < this.getMinPayment()) {
            return null;
        }

        this.paidU = payingAmount;
        this.calculatePrepaidNameDays(false);

        return this.getCurrentUnsExpiration();
    }

}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsContract", UnsContract));

module.exports = {UnsContract};