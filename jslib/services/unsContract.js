const BossBiMapper = require("bossbimapper").BossBiMapper;
const permissions = require('permissions');
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
     * @param {number[]} sealed binary sealed contract.
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
        this.addPermission(modifyDataPermission);

        let revokePermission = new permissions.RevokePermission(ownerLink);
        this.addPermission(revokePermission);
    }

    seal(isTransactionRoot = false) {
        this.saveNamesToState();
        this.saveOriginReferencesToState();
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
}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsContract", UnsContract));

module.exports = {UnsContract};