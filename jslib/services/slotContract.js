const roles = require('roles');
const permissions = require('permissions');
const t = require("tools");
const ex = require("exceptions");

const NSmartContract = require("services/NSmartContract").NSmartContract;

/**
 * Slot contract is one of several types of smarts contracts that can be run on the node. Slot contract provides
 * paid storing of other contracts at the special storage, control storing time and control storing revisions of
 * tracking contract.
 */
class SlotContract extends NSmartContract {

    static PREPAID_KD_FIELD_NAME = "prepaid_KD";
    static PREPAID_FROM_TIME_FIELD_NAME = "prepaid_from";
    static STORED_BYTES_FIELD_NAME = "stored_bytes";
    static SPENT_KD_FIELD_NAME = "spent_KD";
    static SPENT_KD_TIME_FIELD_NAME = "spent_KD_time";
    static KEEP_REVISIONS_FIELD_NAME = "keep_revisions";
    static TRACKING_CONTRACT_FIELD_NAME = "tracking_contract";

    constructor() {
        super();
        this.packedTrackingContracts = [];
        this.trackingContracts = [];
        this.keepRevisions = 1;

        // Calculate U paid with las revision of slot
        this.paidU = 0;
        // All KD (kilobytes*days) prepaid from first revision (sum of all paidU, converted to KD)
        this.prepaidKilobytesForDays = 0;
        // Time of first payment
        this.prepaidFrom = null;
        // Stored bytes for previous revision of slot. Use for calculate spent KDs
        this.storedEarlyBytes = 0;
        // Spent KDs for previous revision
        this.spentEarlyKDs = 0;
        // Time of spent KD's calculation for previous revision
        this.spentEarlyKDsTime = null;
        // Spent KDs for current revision
        this.spentKDs = 0;
        // Time of spent KD's calculation for current revision
        this.spentKDsTime = null;
    }

    /**
     * Slot contract is one of several types of smarts contracts that can be run on the node. Slot contract provides
     * paid storing of other contracts at the special storage, control storing time and control storing revisions of
     * tracking contract.
     * <br><br>
     * Create a default empty new slot contract using a provided key as issuer and owner and sealer. Will set slot's specific
     * permissions and values.
     * <p>
     * This constructor adds key as sealing signature so it is ready to {@link #seal()} just after construction, thought
     * it is necessary to put real data to it first. It is allowed to change owner, expiration and data fields after
     * creation (but before sealing).
     *
     * @param {PrivateKey} key is {@link PrivateKey} for creating roles "issuer", "owner", "creator" and sign contract
     *
     * @return {SlotContract} created slot contract.
     */
    static fromPrivateKey(key) {
        let c = Contract.fromPrivateKey(key, new SlotContract());

        c.addSlotSpecific();
        return c;
    }

    /**
     * Slot contract is one of several types of smarts contracts that can be run on the node. Slot contract provides
     * paid storing of other contracts at the special storage, control storing time and control storing revisions of
     * tracking contract.
     * <br><br>
     * Extract contract from v2 or v3 sealed form, getting revoking and new items from the transaction pack supplied. If
     * the transaction pack fails to resolve a link, no error will be reported - not sure it's a good idea. If need, the
     * exception could be generated with the transaction pack.
     * <p>
     * It is recommended to call {@link #check()} after construction to see the errors.
     *
     * @param {number[]} sealed binary sealed contract.
     * @param {TransactionPack} pack the transaction pack to resolve dependencies again.
     *
     * @return {SlotContract} extracted slot contract.
     */
    static fromSealedBinary(sealed, pack) {
        let c = Contract.fromSealedBinary(sealed, pack, new SlotContract());

        c.deserializeForSlot();
        return c;
    }

    /**
     * Method creates {@link SlotContract} contract from dsl file where contract is described.
     *
     * @param {string} fileName is path to dsl file with yaml structure of data for contract.
     *
     * @return {SlotContract} created and ready {@link SlotContract} contract.
     */
    static fromDslFile(fileName) {
        return Contract.fromDslFile(fileName, new SlotContract());
    }

    /**
     * Method calls from {@link SlotContract#fromDslFile(String)} and initialize contract from given binder.
     *
     * @param {Object} root object with initialized data
     *
     * @return {SlotContract} created and ready {@link SlotContract} contract.
     */
    initializeWithDsl(root) {
        super.initializeWithDsl(root);
        let numRevisions = root.state.data[SlotContract.KEEP_REVISIONS_FIELD_NAME];
        if (numRevisions > 0)
            this.keepRevisions = numRevisions;
        return this;
    }

    /**
     * Method adds slot's specific to contract:
     * <ul>
     *     <li><i>definition.extended_type</i> is sets to SLOT1</li>
     *     <li>adds permission <i>modify_data</i> with needed fields</li>
     * </ul>
     */
    addSlotSpecific() {
        this.definition.extendedType = NSmartContract.SmartContractType.SLOT1;

        let ownerLink = new roles.RoleLink("owner_link", "owner");
        this.registerRole(ownerLink);

        let fieldsMap = {};
        fieldsMap["action"] = null;
        fieldsMap["/expires_at"] = null;
        fieldsMap[SlotContract.KEEP_REVISIONS_FIELD_NAME] = null;
        fieldsMap[SlotContract.PAID_U_FIELD_NAME] = null;
        fieldsMap[SlotContract.PREPAID_KD_FIELD_NAME] = null;
        fieldsMap[SlotContract.PREPAID_FROM_TIME_FIELD_NAME] = null;
        fieldsMap[SlotContract.STORED_BYTES_FIELD_NAME] = null;
        fieldsMap[SlotContract.SPENT_KD_FIELD_NAME] = null;
        fieldsMap[SlotContract.SPENT_KD_TIME_FIELD_NAME] = null;
        fieldsMap[SlotContract.TRACKING_CONTRACT_FIELD_NAME] = null;

        let modifyDataPermission = new permissions.ModifyDataPermission(ownerLink, {fields : fieldsMap});
        this.addPermission(modifyDataPermission);
    }

    /**
     * Extract values from deserializing object for slot fields.
     */
    deserializeForSlot() {
        // extract keep_revisions value
        let numRevisions = this.state.data[SlotContract.KEEP_REVISIONS_FIELD_NAME];
        if (numRevisions > 0)
            this.keepRevisions = numRevisions;

        this.paidU = t.getOrDefault(this.state.data, SlotContract.PAID_U_FIELD_NAME, 0);

        // extract saved prepaid KD (kilobytes*days) value
        this.prepaidKilobytesForDays = t.getOrDefault(this.state.data, SlotContract.PREPAID_KD_FIELD_NAME, 0);

        // and extract time when first time payment was
        let prepaidFromSeconds = t.getOrDefault(this.state.data, SlotContract.PREPAID_FROM_TIME_FIELD_NAME, 0);
        this.prepaidFrom = new Date(prepaidFromSeconds * 1000);

        // extract and sort by revision number
        let contracts = [];
        let trackingHashesAsBase64 = this.state.data[SlotContract.TRACKING_CONTRACT_FIELD_NAME];

        for(let k of Object.keys(trackingHashesAsBase64)) {
            let packed = trackingHashesAsBase64[k];
            if (packed != null) {
                let c = Contract.fromPackedTransaction(packed);
                if (c != null)
                    contracts.push(c);
                else
                    throw new ex.IllegalStateError("reconstruction storing contract from slot.state.data failed: null");
            }
        }

        contracts.sort((a, b) => a.state.revision - b.state.revision);
        contracts.forEach(c => {
            this.trackingContracts.unshift(c);
            this.packedTrackingContracts.unshift(c.getPackedTransaction());
        });
    }

    /**
     * Override seal method to recalculate holding at the state.data values
     */
    seal() {
        this.saveTrackingContractsToState();
        this.calculatePrepaidKilobytesForDays(true);

        return super.seal();
    }

    saveTrackingContractsToState() {
        let forState = {};
        this.trackingContracts.forEach(tc => forState[tc.id.base64] = tc.getPackedTransaction());
        this.state.data[SlotContract.TRACKING_CONTRACT_FIELD_NAME] = forState;
    }

    /**
     * @return {Uint8Array} last revision of the tracking contract packed as {@link TransactionPack}.
     */
    getPackedTrackingContract() {
        if (this.packedTrackingContracts != null && this.packedTrackingContracts.length > 0)
            return this.packedTrackingContracts[0];

        return null;
    }

    /**
     * @return {Contract} last revision of the tracking contract.
     */
    getTrackingContract() {
        if (this.trackingContracts != null && this.trackingContracts.length > 0)
            return this.trackingContracts[0];

        return null;
    }

    /**
     * @param {HashId} hashId contract's id to check
     * @return {boolean} true if hashId is present in tracking revisions
     */
    isContractTracking(hashId) {
        if (this.trackingContracts != null && this.trackingContracts.length > 0)
            return this.trackingContracts.some(c => c.id.equals(hashId));

        return false;
    }


    /**
     * Put contract to the tracking contract's revisions queue.
     * If queue contains more then {@link SlotContract#keepRevisions} revisions then last one will removed.
     * @param {Contract} c is revision of tracking {@link Contract}.
     */
    putTrackingContract(c) {
        this.trackingContracts.unshift(c);
        this.packedTrackingContracts.unshift(c.getPackedTransaction());

        this.updateTrackingContracts();
    }

    /**
     * Sets number of revisions of tracking contract to hold in the storage.
     * @param {number} keepRevisions is number of revisions to keep.
     */
    setKeepRevisions(keepRevisions) {
        if (keepRevisions < 1)
            throw new ex.IllegalArgumentError("Keep revisions should be positive");

        this.state.data[SlotContract.KEEP_REVISIONS_FIELD_NAME] = keepRevisions;
        this.keepRevisions = keepRevisions;
        this.updateTrackingContracts();
    }

    updateTrackingContracts() {
        this.trackingContracts.splice(this.keepRevisions, this.trackingContracts.length);
        this.packedTrackingContracts.splice(this.keepRevisions, this.packedTrackingContracts.length);
    }

    /**
     * It is private method that looking for U contract in the new items of this slot contract. Then calculates
     * new payment, looking for already paid, summize it and calculate new prepaid period for storing, that sets to
     * {@link SlotContract#prepaidKilobytesForDays}. This field is measured in the kilobytes*days, means how many kilobytes
     * storage can hold for how many days.
     * But if withSaveToState param is false, calculated value
     * do not saving to state. It is useful for checking set state.data values.
     * <br><br> Additionally will be calculated new times of payment refilling, and storing info for previous revision of slot.
     * It is also useful for slot checking.
     * @param {boolean} withSaveToState if true, calculated values is saving to  state.data
     * @return {number} calculated {@link SlotContract#prepaidKilobytesForDays}.
     */
    calculatePrepaidKilobytesForDays(withSaveToState) {

        this.paidU = this.getPaidU();

        // then looking for prepaid early U that can be find at the stat.data
        // additionally we looking for and calculate times of payment fillings and some other data
        /*ZonedDateTime now = ZonedDateTime.ofInstant(Instant.ofEpochSecond(ZonedDateTime.now().toEpochSecond()), ZoneId.systemDefault());
        double wasPrepaidKilobytesForDays;
        long wasPrepaidFrom = now.toEpochSecond();
        long spentEarlyKDsTimeSecs = now.toEpochSecond();
        Contract parentContract = getRevokingItem(getParent());
        if(parentContract != null) {
            wasPrepaidKilobytesForDays = parentContract.getStateData().getDouble(PREPAID_KD_FIELD_NAME);
            wasPrepaidFrom = parentContract.getStateData().getLong(PREPAID_FROM_TIME_FIELD_NAME, now.toEpochSecond());
            storedEarlyBytes = parentContract.getStateData().getLong(STORED_BYTES_FIELD_NAME, 0);
            spentEarlyKDs = parentContract.getStateData().getDouble(SPENT_KD_FIELD_NAME);
            spentEarlyKDsTimeSecs = parentContract.getStateData().getLong(SPENT_KD_TIME_FIELD_NAME, now.toEpochSecond());
        } else {
            wasPrepaidKilobytesForDays = 0;
        }

        spentEarlyKDsTime = ZonedDateTime.ofInstant(Instant.ofEpochSecond(spentEarlyKDsTimeSecs), ZoneId.systemDefault());
        prepaidFrom = ZonedDateTime.ofInstant(Instant.ofEpochSecond(wasPrepaidFrom), ZoneId.systemDefault());
        prepaidKilobytesForDays = wasPrepaidKilobytesForDays + paidU * getRate().doubleValue();

        spentKDsTime = now;

        long spentSeconds = (spentKDsTime.toEpochSecond() - spentEarlyKDsTime.toEpochSecond());
        double spentDays = (double) spentSeconds / (3600 * 24);
        spentKDs = spentEarlyKDs + spentDays * (storedEarlyBytes / 1024);

        // if true we save it to stat.data
        if(withSaveToState) {
            getStateData().set(PAID_U_FIELD_NAME, paidU);

            getStateData().set(PREPAID_KD_FIELD_NAME, prepaidKilobytesForDays);
            if(getRevision() == 1)
                getStateData().set(PREPAID_FROM_TIME_FIELD_NAME, now.toEpochSecond());

            int storingBytes = 0;
            for(byte[] p : packedTrackingContracts)
            storingBytes += p.length;

            getStateData().set(STORED_BYTES_FIELD_NAME, storingBytes);

            getStateData().set(SPENT_KD_FIELD_NAME, spentKDs);
            getStateData().set(SPENT_KD_TIME_FIELD_NAME, spentKDsTime.toEpochSecond());
        }

        return prepaidKilobytesForDays;*/
    }
}