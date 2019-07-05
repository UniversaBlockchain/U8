const bs = require("biserializable");
const Contract = require("contract").Contract;
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const ex = require("exceptions");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
/**
 * Implements {@see NContract} interface for contract {@see Contract}.
 */
class NSmartContract extends Contract {

    static PAID_U_FIELD_NAME = "paid_U";

    static SmartContractType = {
        N_SMART_CONTRACT : "N_SMART_CONTRACT",
        SLOT1 : "SLOT1",
        UNS1 : "UNS1",
        FOLLOWER1 : "FOLLOWER1"
    };

    constructor() {
        super();
        this.nodeInfoProvider = null;
    }

    /**
     * Extract contract from v2 or v3 sealed form, getting revoking and new items from the transaction pack supplied.
     * If the transaction pack fails to resolve a link, no error will be reported - not sure it's a good idea.
     * If need, the exception could be generated with the transaction pack.
     * <p>
     * It is recommended to call {@link #check()} after construction to see the errors.
     *
     * @param {number[]} sealed - binary sealed contract.
     * @param {TransactionPack} pack - the transaction pack to resolve dependencies again.
     *
     * @return {NSmartContract} extracted smart contract.
     */
    static fromSealedBinary(sealed, pack) {
        return Contract.fromSealedBinary(sealed, pack, new NSmartContract());
    }

    /**
     * Create a default empty new contract using a provided key as issuer and owner and sealer.
     * Default expiration is set to 5 years.
     * <p>
     * This constructor adds key as sealing signature so it is ready to {@link #seal()} just after construction, thought
     * it is necessary to put real data to it first. It is allowed to change owner, expiration and data fields after
     * creation (but before sealing).
     *
     * @param {crypto.PrivateKey} key is {@link crypto.PrivateKey} for creating roles "issuer", "owner", "creator" and sign contract
     *
     * @return {NSmartContract} created smart contract.
     */
    static fromPrivateKey(key) {
        let c = Contract.fromPrivateKey(key, new NSmartContract());
        c.definition.extendedType = NSmartContract.SmartContractType.N_SMART_CONTRACT;
        return c;
    }

    /**
     * Method creates smart contract from dsl file where contract is described.
     *
     * @param {string} fileName is path to dsl file with yaml structure of data for contract.
     *
     * @return {NSmartContract} initialized smart contract.
     */
    static fromDslFile(fileName) {
        return Contract.fromDslFile(fileName, new NSmartContract());
    }

    getExtendedType() {
        return this.definition.extendedType;
    }

    beforeCreate(c) {
        return true;
    }

    beforeUpdate(c) {
        return true;
    }

    beforeRevoke(c) {
        return true;
    }

    onCreated(c) {
        return {status : "ok"};
    }

    onUpdated(c) {
        return {status : "ok"};
    }

    onRevoked(c) {}

    onContractSubscriptionEvent(event) {}

    /**
     * Asynchronously checks smart contract filling the {@link Contract.errors}.
     *
     * @param prefix - used for subsequent checks of children contracts
     * @param contractsTree - used for subsequent checks of children contracts
     * @returns {Promise<boolean> | boolean} indicating if check was successful
     */
    check(prefix, contractsTree) {
        // check that type of smart contract is set and exist
        if (this.getExtendedType() == null) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "definition.extended_type",
                "value not defined, should be string from SmartContractType enum"));
            return false;
        }

        if (!NSmartContract.SmartContractType.hasOwnProperty(this.getExtendedType())) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "definition.extended_type",
                "illegal value, should be string from SmartContractType enum"));
            return false;
        }

        return super.check(prefix, contractsTree);
    }

    checkProvider() {
        if (this.nodeInfoProvider == null)
            throw new ex.IllegalStateError("NodeInfoProvider is not set for NSmartContract");
    }

    getMinPayment() {
        this.checkProvider();
        return this.nodeInfoProvider.getMinPayment(this.getExtendedType());
    }

    getPaidU(allowTestPayments = false) {
        this.checkProvider();

        // first of all looking for U contract and calculate paid U amount.
        this.newItems.forEach(nc => {
            if (nc.isU(this.nodeInfoProvider.getUIssuerKeys(), this.nodeInfoProvider.getUIssuerName())) {
                let calculatedPayment = 0;
                let isTestPayment = false;

                let parent = null;
                for (let nrc of nc.revokingItems)
                    if (nrc.id.equals(nc.state.parent)) {
                        parent = nrc;
                        break;
                    }

                if (parent != null) {
                    if (nc.state.data.test_transaction_units != null) {
                        isTestPayment = true;
                        calculatedPayment = parent.state.data.test_transaction_units - nc.state.data.test_transaction_units;

                        if (calculatedPayment <= 0) {
                            isTestPayment = false;
                            calculatedPayment = parent.state.data.transaction_units - nc.state.data.transaction_units;
                        }
                    } else {
                        isTestPayment = false;
                        calculatedPayment = parent.state.data.transaction_units - nc.state.data.transaction_units;
                    }
                }

                if (!isTestPayment || allowTestPayments)
                    return calculatedPayment;
            }
        });

        return 0;
    }

    getRate(key = undefined) {
        this.checkProvider();

        if (key !== undefined)
            return this.nodeInfoProvider.getServiceRate(this.getExtendedType() + ":" + key);
        else
            return this.nodeInfoProvider.getServiceRate(this.getExtendedType());
    }

    getAdditionalKeysToSignWith() {
        this.checkProvider();
        return this.nodeInfoProvider.getAdditionalKeysToSignWith(this.getExtendedType());
    }

    /**
     * Creates {@see Object} that will be returned to client after smart contract have been approved.
     * @return {Object}
     */
    getExtraResultForApprove() {
        return {};
    }

    getTrackingOrigins() {
        return null;
    }

    getCallbackKeys() {
        return null;
    }

    canFollowContract(contract) {
        return false;
    }
}

class NodeInfoProvider {

    /**
     * Get issuer key addresses of U-contract.
     *
     * @return {Set<KeyAddress>} set of key addresses.
     */
    getUIssuerKeys() {
        throw new Error("not implemented");
    }

    /**
     * Get issuer name of U-contract.
     *
     * @return {string} issuer name.
     */
    getUIssuerName() {
        throw new Error("not implemented");
    }

    /**
     * Get min payment for smart contract by type.
     *
     * @param {string} extendedType - Type of smart contract.
     *
     * @return {number} min payment in U.
     */
    getMinPayment(extendedType) {
        throw new Error("not implemented");
    }

    /**
     * Get rate for smart contract by type.
     *
     * @param {string} extendedType - Type of smart contract.
     *
     * @return {number} rate in U.
     */
    getServiceRate(extendedType) {
        throw new Error("not implemented");
    }

    /**
     * Get additional public keys for sing by type of smart contract.
     *
     * @param {string} extendedType - Type of smart contract.
     *
     * @return {Set<PublicKey>} set of additional public keys.
     */
    getAdditionalKeysToSignWith(extendedType) {
        throw new Error("not implemented");
    }
}

const smartContractAdapter = new bs.BiAdapter("UniversaContract", NSmartContract);
DefaultBiMapper.getInstance().adapters.set(smartContractAdapter.getType(), smartContractAdapter);

module.exports = {NSmartContract, NodeInfoProvider};