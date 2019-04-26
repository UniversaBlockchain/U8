const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const permissions = require('permissions');
const Constraint = require('constraint').Constraint;
const roles = require('roles');
const t = require("tools");
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const ex = require("exceptions");

const NSmartContract = require("services/NSmartContract").NSmartContract;
const UnsName = require("services/unsName").UnsName;

const CONSTRAINT_CONDITION_PREFIX = "ref.state.origin==";
const CONSTRAINT_CONDITION_LEFT = "ref.state.origin";
const CONSTRAINT_CONDITION_OPERATOR = 7;       // EQUAL

class UnsContract extends NSmartContract {

    static NAMES_FIELD_NAME = "names";
    static PREPAID_ND_FIELD_NAME = "prepaid_ND";
    static PREPAID_ND_FROM_TIME_FIELD_NAME = "prepaid_ND_from";
    static STORED_ENTRIES_FIELD_NAME = "stored_entries";
    static SPENT_ND_FIELD_NAME = "spent_ND";
    static SPENT_ND_TIME_FIELD_NAME = "spent_ND_time";

    constructor() {
        super();
        // Stored UNS names
        this.storedNames = [];
        // Calculate U paid with las revision of UNS
        this.paidU = 0;
        // All ND (names*days) prepaid from first revision (sum of all paidU, converted to ND)
        this.prepaidNamesForDays = 0;
        // Spent NDs for current revision
        this.spentNDs = 0;
        // Time of spent ND's calculation for current revision
        this.spentNDsTime = null;
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
    static fromSealedBinary(sealed, pack) {
        let c = Contract.fromSealedBinary(sealed, pack, new UnsContract());

        c.deserializeForUns();
        return c;
    }

    /**
     * Method creates {@link UnsContract} contract from dsl file where contract is described.
     *
     * @param {string} fileName is path to dsl file with yaml structure of data for contract.
     *
     * @return {UnsContract} created and ready {@link UnsContract} contract.
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

        return this;
    }

    deserialize(data, deserializer) {
        super.deserialize(data, deserializer);

        this.deserializeForUns();
    }

    /**
     * Extract values from deserialized object for UNS fields.
     */
    deserializeForUns() {
        this.storedNames = BossBiMapper.getInstance().deserialize(t.getOrDefault(this.state.data, UnsContract.NAMES_FIELD_NAME, null));

        this.paidU = t.getOrDefault(this.state.data, UnsContract.PAID_U_FIELD_NAME, 0);
        this.prepaidNamesForDays = t.getOrDefault(this.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
    }

    /**
     * Initialize UnsContract internal data structure with specific UNS1 parameters.
     */
    addUnsSpecific() {
        this.definition.extendedType = NSmartContract.SmartContractType.UNS1;

        let ownerLink = new roles.RoleLink("owner_link", "owner");
        this.registerRole(ownerLink);

        let fieldsMap = {};
        fieldsMap["action"] = null;
        fieldsMap["/expires_at"] = null;
        fieldsMap["/references"] = null;
        fieldsMap[UnsContract.NAMES_FIELD_NAME] = null;
        fieldsMap[UnsContract.PAID_U_FIELD_NAME] = null;
        fieldsMap[UnsContract.PREPAID_ND_FIELD_NAME] = null;
        fieldsMap[UnsContract.PREPAID_ND_FROM_TIME_FIELD_NAME] = null;
        fieldsMap[UnsContract.STORED_ENTRIES_FIELD_NAME] = null;
        fieldsMap[UnsContract.SPENT_ND_FIELD_NAME] = null;
        fieldsMap[UnsContract.SPENT_ND_TIME_FIELD_NAME] = null;

        let modifyDataPermission = new permissions.ModifyDataPermission(ownerLink, {fields : fieldsMap});
        this.definition.addPermission(modifyDataPermission);

        let revokePermission = new permissions.RevokePermission(ownerLink);
        this.definition.addPermission(revokePermission);
    }

    seal(isTransactionRoot = false) {
        this.saveNamesToState();
        this.saveOriginConstraintsToState();
        this.calculatePrepaidNamesForDays(true);

        return super.seal(isTransactionRoot);
    }

    /**
     * It is private method that looking for U contract in the new items of this UNS contract. Then calculates
     * new payment, looking for already paid, summarize it and calculate new prepaid period for UNS names registration,
     * that sets to {@link UnsContract#prepaidNamesForDays}. This field is measured in the names*days, means how many
     * names registered for how many days.
     * But if withSaveToState param is false, calculated value do not saving to state.
     * It is useful for checking set state.data values.
     * <br><br> Additionally will be calculated new times of payment refilling, and storing info for previous revision of UNS.
     * It is also useful for UNS contract checking.
     * @param {boolean} withSaveToState if true, calculated values is saving to state.data
     */
    calculatePrepaidNamesForDays(withSaveToState) {

        this.paidU = this.getPaidU();

        this.spentNDsTime = new Date();
        let now = Math.floor(Date.now() / 1000);
        let wasPrepaidNamesForDays;
        let storedEarlyEntries;
        let spentEarlyNDs;
        let spentEarlyNDsTimeSecs = now;
        let parentContract = this.getRevokingItem(this.state.parent);
        if (parentContract != null) {
            wasPrepaidNamesForDays = t.getOrDefault(parentContract.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0);
            spentEarlyNDsTimeSecs = t.getOrDefault(parentContract.state.data, UnsContract.SPENT_ND_TIME_FIELD_NAME, now);
            storedEarlyEntries = t.getOrDefault(parentContract.state.data, UnsContract.STORED_ENTRIES_FIELD_NAME, 0);
            spentEarlyNDs = t.getOrDefault(parentContract.state.data, UnsContract.SPENT_ND_FIELD_NAME, 0);
        } else
            wasPrepaidNamesForDays = 0;

        this.prepaidNamesForDays = wasPrepaidNamesForDays + this.paidU * Number(this.getRate());

        let spentSeconds = Math.floor(this.spentNDsTime.getTime() / 1000) - spentEarlyNDsTimeSecs;
        let spentDays = spentSeconds / (3600 * 24);
        this.spentNDs = spentEarlyNDs + spentDays * storedEarlyEntries;

        if (withSaveToState) {
            this.state.data[UnsContract.PAID_U_FIELD_NAME] = this.paidU;

            this.state.data[UnsContract.PREPAID_ND_FIELD_NAME] = this.prepaidNamesForDays;
            if (this.state.revision === 1)
                this.state.data[UnsContract.PREPAID_ND_FROM_TIME_FIELD_NAME] = now;

            // calculate num of entries
            let storingEntries = 0;
            this.storedNames.forEach(name => storingEntries += name.getRecordsCount());
            this.state.data[UnsContract.STORED_ENTRIES_FIELD_NAME] = storingEntries;

            this.state.data[UnsContract.SPENT_ND_FIELD_NAME] = this.spentNDs;
            this.state.data[UnsContract.SPENT_ND_TIME_FIELD_NAME] = now;
        }
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
        let origins = new Set();
        let constraintsToRemove = new Set();

        this.storedNames.forEach(sn => sn.unsRecords.forEach(unsRecord => {
            if (unsRecord.unsOrigin != null)
                origins.add(unsRecord.unsOrigin);
        }));

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
            else {
                let originConstr = null;
                for (let c of this.constraints.values())
                    if (c.conditions.hasOwnProperty(Constraint.conditionsModeType.all_of) &&
                        c.conditions[Constraint.conditionsModeType.all_of].some(cond => UnsContract.isOriginCondition(cond, origin))) {
                        originConstr = c;
                        break;
                    }

                if (originConstr != null && originConstr.matchingItems.size === 0 && this.originContracts.has(origin))
                    originConstr.addMatchingItem(this.originContracts.get(origin));
            }
        });
    }

    /**
     * Save UNS names to state.
     */
    saveNamesToState() {
        this.state.data[UnsContract.NAMES_FIELD_NAME] = this.storedNames;
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

        let checkResult = true;

        this.calculatePrepaidNamesForDays(false);

        if (this.paidU === 0) {
            if (this.getPaidU(true) > 0)
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "",
                    "Test payment is not allowed for storing names"));
            checkResult = false;
        } else if (this.paidU < this.getMinPayment()) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "",
                "Payment for UNS contract is below minimum level of " + this.getMinPayment() + "U"));
            checkResult = false;
        }

        if (!checkResult) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "UNS contract hasn't valid payment"));
            return false;
        }

        // check that payment was not hacked
        if (this.prepaidNamesForDays !== t.getOrDefault(this.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0)) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "state.data." + UnsContract.PREPAID_ND_FIELD_NAME,
                "Should be sum of early paid U and paid U by current revision."));
            return false;
        }

        return this.additionallyUnsCheck(c);
    }

    /**
     * Callback called by the node before registering new revision of the UNS-contract for his check.
     *
     * @param {ImmutableEnvironment} c is {@link ImmutableEnvironment} object with some data.
     * @return {boolean} check result.
     */
    beforeUpdate(c) {
        this.calculatePrepaidNamesForDays(false);

        // check that payment was not hacked
        if (this.prepaidNamesForDays !== t.getOrDefault(this.state.data, UnsContract.PREPAID_ND_FIELD_NAME, 0)) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "state.data." + UnsContract.PREPAID_ND_FIELD_NAME,
                "Should be sum of early paid U and paid U by current revision."));
            return false;
        }

        return this.additionallyUnsCheck(c);
    }

    /**
     * Callback called by the node before revocation the UNS-contract for his check.
     *
     * @param {ImmutableEnvironment} c is {@link ImmutableEnvironment} object with some data.     *
     * @return {boolean} check result.
     */
    beforeRevoke(c) {
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

        if (this.definition.extendedType !== NSmartContract.SmartContractType.UNS1) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "definition.extended_type",
                "illegal value, should be " + NSmartContract.SmartContractType.UNS1 + " instead " + this.definition.extendedType));
            return false;
        }

        if (this.storedNames.length === 0) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME, "Names for storing is missing"));
            return false;
        }

        if (!this.storedNames.every(n => n.unsRecords.every(unsRecord => {
            if (unsRecord.unsOrigin != null) {
                if (unsRecord.unsAddresses.length > 0) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "name " + n.unsName + " referencing to origin AND addresses. Should be either origin or addresses"));
                    return false;
                }

                //check reference exists in contract (ensures that matching contract was checked by system for being approved)
                if (!this.isOriginConstraintExists(unsRecord.unsOrigin)) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "name " + n.unsName + " referencing to origin " + unsRecord.unsOrigin.toString() +
                        " but no corresponding reference is found"));
                    return false;
                }

                let matchingContracts = [];
                if (this.transactionPack != null && this.transactionPack.referencedItems.size > 0)
                    matchingContracts = Array.from(this.transactionPack.referencedItems.values()).filter(contract =>
                        contract.id.equals(unsRecord.unsOrigin) || contract.getOrigin() != null && contract.getOrigin().equals(unsRecord.unsOrigin));

                if (matchingContracts.length === 0) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "name " + n.unsName + " referencing to origin " + unsRecord.unsOrigin.toString() +
                        " but no corresponding referenced contract is found"));
                    return false;
                }

                if (!matchingContracts[0].roles.issuer.isAllowedForKeys(this.effectiveKeys.keys())) {
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                        "name " + n.unsName + " referencing to origin " + unsRecord.unsOrigin.toString() +
                        ". UNS1 contract should be also signed by this contract issuer key."));
                    return false;
                }

                return true;
            }

            if (unsRecord.unsAddresses.length === 0) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                    "name " + n.unsName + " is missing both addresses and origin."));
                return false;
            }

            if (unsRecord.unsAddresses.length > 2)
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                    "name " + n.unsName + ": Addresses list should not be contains more 2 addresses"));

            if (unsRecord.unsAddresses.length === 2 && unsRecord.unsAddresses[0].base64.length === unsRecord.unsAddresses[1].base64.length)
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                    "name " + n.unsName + ": Addresses list may only contain one short and one long addresses"));

            if (!unsRecord.unsAddresses.every(keyAddress =>
                Array.from(this.effectiveKeys.keys()).some(key => keyAddress.match(key)))) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, UnsContract.NAMES_FIELD_NAME,
                    "name " + n.unsName + " using address that missing corresponding key UNS contract signed with."));
                return false;
            }

            return true;
        })))
            return false;

        if (!Array.from(this.getAdditionalKeysToSignWith()).every(ak =>
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
        let origins = new Set();
        this.storedNames.forEach(sn => sn.unsRecords.forEach(rec => {
            if (rec.unsOrigin != null)
                origins.add(rec.unsOrigin);
        }));

        this.revokingItems.forEach(revoked => this.removeRevokedOrigins(revoked, origins));

        return Array.from(origins);
    }

    removeRevokedOrigins(contract, set) {
        if (contract instanceof UnsContract)
            contract.storedNames.forEach(sn => sn.unsRecords.forEach(rec => {
                if (rec.unsOrigin != null)
                    set.delete(rec.unsOrigin);
            }));

        contract.revokingItems.forEach(revoked => this.removeRevokedOrigins(revoked, set));
    }

    getAddressesToCheck() {
        let addresses = new Set();
        this.storedNames.forEach(sn => sn.unsRecords.forEach(rec =>
            rec.unsAddresses.forEach(ka => addresses.add(ka.toString()))));

        this.revokingItems.forEach(revoked => this.removeRevokedAddresses(revoked, addresses));

        return Array.from(addresses);
    }

    removeRevokedAddresses(contract, set) {
        if (contract instanceof UnsContract)
            contract.forEach(sn => sn.unsRecords.forEach(rec =>
                rec.unsAddresses.forEach(ka => set.remove(ka.toString()))));

        contract.revokingItems.forEach(revoked => this.removeRevokedAddresses(revoked, set));
    }

    calcExpiresAt() {
        // get number of entries
        let entries = 0;
        this.storedNames.forEach(sn => entries += sn.getRecordsCount());
        if (entries === 0)
            entries = 1;

        // calculate time that will be added to now as new expiring time
        // it is difference of all prepaid ND (names*days) and already spent divided to new number of entries.
        let seconds = Math.floor((this.prepaidNamesForDays - this.spentNDs) * 24 * 3600 / entries);

        return this.spentNDsTime.setSeconds(this.spentNDsTime.getSeconds() + seconds);
    }

    /**
     * Callback called by the node after registering the UNS-contract.
     *
     * @param {MutableEnvironment} me is {@link MutableEnvironment} object with some data.
     * @return {Object} object contains operation status.
     */
    onCreated(me) {
        this.calculatePrepaidNamesForDays(false);
        let expiresAt = this.calcExpiresAt();
        this.storedNames.forEach(sn => me.createNameRecord(sn, expiresAt));
        return {status : "ok"};
    }

    /**
     * Callback called by the node after registering new revision of the UNS-contract.
     *
     * @param {MutableEnvironment} me is {@link MutableEnvironment} object with some data.
     * @return {Object} object contains operation status.
     */
    onUpdated(me) {
        this.calculatePrepaidNamesForDays(false);

        let expiresAt = this.calcExpiresAt();

        let newNames = new Map();
        this.storedNames.forEach(sn => newNames.set(sn.unsName, sn));

        me.nameRecords().forEach(nameRecord => {
            let unsName = newNames.get(nameRecord.getName());
            if (unsName != null && unsName.getRecordsCount() === nameRecord.getEntries().length &&
                unsName.unsRecords.every(unsRecord => nameRecord.getEntries().some(entry => unsRecord.equalsTo(entry)))) {

                me.setNameRecordExpiresAt(nameRecord, expiresAt);
                newNames.delete(nameRecord.getName());
            } else
                me.destroyNameRecord(nameRecord);
        });

        Array.from(newNames.values()).forEach(sn => me.createNameRecord(sn, expiresAt));

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
        return {expires_at : Math.floor(this.calcExpiresAt().getTime() / 1000)};
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
     * Add {@link UnsName} record that describes name that will be stored by this UnsContract.
     *
     * @param {UnsName} unsName record.
     */
    addUnsName(unsName) {
        this.storedNames.push(unsName);
    }

    /**
     * Returns {@link UnsName} record by it's name.
     *
     * @param {string} name of unsName record.
     * @return {UnsName | null} unsName record or null if not found.
     */
    getUnsName(name) {
        for (let unsName of this.storedNames)
            if (unsName.unsName === name)
                return unsName;

        return null;
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
}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsContract", UnsContract));

module.exports = {UnsContract};