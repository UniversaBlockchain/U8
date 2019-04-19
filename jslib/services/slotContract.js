const roles = require('roles');
const permissions = require('permissions');
const t = require("tools");

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

        /*for (String k : trackingHashesAsBase64.keySet()) {
            byte[] packed = trackingHashesAsBase64.getBinary(k);
            if(packed != null) {
                Contract c = Contract.fromPackedTransaction(packed);
                if(c != null) {
                    contracts.add(c);
                } else {
                    System.err.println("reconstruction storing contract from slot.state.data failed: null");
                }
            }
        }
        Collections.sort(contracts, Comparator.comparingInt(Contract::getRevision));
        for (Contract c : contracts) {
            if(trackingContracts != null) {
                trackingContracts.addFirst(c);
                packedTrackingContracts.addFirst(c.getPackedTransaction());
            } else {
                System.err.println("trackingContracts: " + trackingContracts + " packedTrackingContracts: " + packedTrackingContracts);
            }
        }*/
    }
}