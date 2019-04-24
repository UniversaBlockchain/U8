const BigDecimal  = require("big").Big;
const roles = require('roles');
const permissions = require('permissions');
const t = require("tools");
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;

const NSmartContract = require("services/NSmartContract").NSmartContract;
const events = require("services/contractSubscription");

/**
 * Follower contract is one of several types of smarts contracts that can be run on the node. Follower contract provides
 * paid of sending callbacks when registering a new contract (revision) in the chain.
 */
class FollowerContract extends NSmartContract {

    static PREPAID_OD_FIELD_NAME = "prepaid_OD";
    static PREPAID_FROM_TIME_FIELD_NAME = "prepaid_from";
    static FOLLOWED_ORIGINS_FIELD_NAME = "followed_origins";
    static SPENT_OD_FIELD_NAME = "spent_OD";
    static SPENT_OD_TIME_FIELD_NAME = "spent_OD_time";
    static CALLBACK_RATE_FIELD_NAME = "callback_rate";
    static TRACKING_ORIGINS_FIELD_NAME = "tracking_origins";
    static CALLBACK_KEYS_FIELD_NAME = "callback_keys";
    static FOLLOWER_ROLES_FIELD_NAME = "follower_roles";

    constructor(key, sealed, pack) {
        super();

        this.trackingOrigins = new Map();  // TODO delete containsValue
        this.callbackKeys = new Map();     // TODO delete containsValue

        this.key = key;
        this.sealed = sealed;
        this.pack = pack;

        // Calculate U paid with last revision of follower
        this.paidU = 0;
        // All OD (origins*days) prepaid from first revision (sum of all paidU, converted to OD)
        this.prepaidOriginDays = 0;
        // Time of first payment
        this.prepaidFrom = null;
        // Followed origins for previous revision. Use for calculate spent ODs
        this.storedEarlyOrigins = 0;
        // Spent ODs for previous revision
        this.spentEarlyODs = 0;
        // Time of spent OD's calculation for previous revision
        this.spentEarlyODsTime = null;
        // Spent ODs for current revision
        this.spentODs = 0;
        // Time of spent OD's calculation for current revision
        this.spentODsTime = null;
        // Current revision callback rate
        this.callbackRate = 0;
    }

    /**
     * Follower contract is one of several types of smarts contracts that can be run on the node. Follower contract
     * provides paid of sending callbacks when registering a new contract (revision) in the chain.
     *
     * Create a default empty new follower contract using a provided key as issuer and owner and sealer. Will set
     * follower's specific permissions and values.
     *
     * This constructor adds key as sealing signature so it is ready to {@link #seal()} just after construction, thought
     * it is necessary to put real data to it first. It is allowed to change owner, expiration and data fields after
     * creation (but before sealing).
     *
     * @param {PrivateKey} key - Private key for creating roles "issuer", "owner", "creator" and sign contract.
     * @return {FollowerContract} created follower contract.
     */
    static fromPrivateKey(key) {
        let c = Contract.fromPrivateKey(key, new FollowerContract());

        c.addFollowerSpecific();
        return c;
    }

    /**
     * Follower contract is one of several types of smarts contracts that can be run on the node. Follower contract
     * provides paid of sending callbacks when registering a new contract (revision) in the chain.
     *
     * Extract contract from v2 or v3 sealed form, getting revoking and new items from the transaction pack supplied. If
     * the transaction pack fails to resolve a link, no error will be reported - not sure it's a good idea. If need, the
     * exception could be generated with the transaction pack.
     *
     * It is recommended to call {@link #check()} after construction to see the errors.
     *
     * @param {number[]} sealed - Binary sealed contract.
     * @param {TransactionPack} pack - The transaction pack to resolve dependencies again.
     * @return {FollowerContract} extracted follower contract.
     */
    static fromSealedBinary(sealed, pack) {
        let c = Contract.fromSealedBinary(sealed, pack, new FollowerContract());

        c.deserializeForFollower();
        return c;
    }

    /**
     * Method creates {@link FollowerContract} contract from dsl file where contract is described.
     *
     * @param {string} fileName - Path to dsl file with yaml structure of data for contract.
     * @return {FollowerContract} created and ready {@link FollowerContract} contract.
     */
    static fromDslFile(fileName) {
        return Contract.fromDslFile(fileName, new FollowerContract());
    }

    /**
     * Method calls from {@link FollowerContract#fromDslFile(String)} and initialize contract from given binder.
     *
     * @param {Object} root - root object with initialized data.
     * @return {FollowerContract} created and ready {@link FollowerContract} contract.
     */
    initializeWithDsl(root) {
        super.initializeWithDsl(root);
        return this;
    }

    /**
     * Method adds follower's specific to contract.
     */
     addFollowerSpecific() {
        if(this.definition.extendedType == null || !this.definition.extendedType().equals(NSmartContract.SmartContractType.FOLLOWER1))
            this.definition.extendedType(NSmartContract.SmartContractType.FOLLOWER1);

        let ownerLink = new roles.RoleLink("owner_link", "owner");
        this.registerRole(ownerLink);

        let fieldsMap = {};

        fieldsMap["action"] = null;
        fieldsMap["/expires_at"] = null;
        fieldsMap[FollowerContract.PAID_U_FIELD_NAME] = null;
        fieldsMap[FollowerContract.PREPAID_OD_FIELD_NAME] = null;
        fieldsMap[FollowerContract.PREPAID_FROM_TIME_FIELD_NAME] = null;
        fieldsMap[FollowerContract.FOLLOWED_ORIGINS_FIELD_NAME] = null;
        fieldsMap[FollowerContract.SPENT_OD_FIELD_NAME] = null;
        fieldsMap[FollowerContract.SPENT_OD_TIME_FIELD_NAME] = null;
        fieldsMap[FollowerContract.CALLBACK_RATE_FIELD_NAME] = null;
        fieldsMap[FollowerContract.TRACKING_ORIGINS_FIELD_NAME] = null;
        fieldsMap[FollowerContract.CALLBACK_KEYS_FIELD_NAME] = null;

        let modifyDataPermission = new permissions.ModifyDataPermission(ownerLink, {fields : fieldsMap});
        this.addPermission(modifyDataPermission);
    }

    /**
     * Check whether the origin is tracked in the follower contract.
     *
     * @param {HashId} origin - Origin to check.
     * @return {boolean} true if origin is tracking.
     */
    isOriginTracking(origin) {
        if (this.trackingOrigins != null)
            return this.trackingOrigins.has(origin);

        return false;
    }

    /**
     * Put new tracking origin and his callback data (URL and callback public key) to the follower contract.
     * If origin already contained in follower contract, old callback data is replaced.
     * If callback URL already contained in follower contract, old callback key is replaced.
     *
     * @param {HashId} origin - Origin for tracking.
     * @param {string} URL - URL for callback if registered new revision with tracking origin.
     * @param {PublicKey} key - Key for checking receipt from callback by Universa network.
     */
    putTrackingOrigin(origin, URL, key) {
        this.trackingOrigins.set(origin, URL);
        this.callbackKeys.set(URL, key);
    }

    /**
     * Removes tracking origin from the follower contract.
     *
     * @param {HashId} origin - Origin for remove.
     */
    removeTrackingOrigin(origin) {
        if (this.trackingOrigins.has(origin)) {
            let URL = this.trackingOrigins.get(origin);

            this.trackingOrigins.delete(origin);

            if (!this.trackingOrigins.containsValue(URL))
                this.callbackKeys.delete(URL);
        }
    }

    /**
     * Check whether the callback URL is used in tracking origins of follower contract.
     *
     * @param {string} URL - URL to check.
     * @return {boolean} true if callback URL is used in tracking origins.
     */
    isCallbackURLUsed(URL) {
        if (this.callbackKeys != null)
            return this.callbackKeys.has(URL);

        return false;
    }

    /**
     * Updates the callback key by callback URL
     *
     * @param {string} URL - Updated callback URL.
     * @param {PublicKey} key - New {@link PublicKey} for update by callback URL.
     * @return {boolean} true if callback URL was updated.
     */
    updateCallbackKey(URL, key) {
        if ((this.callbackKeys != null) && this.callbackKeys.has(URL)) {
            this.callbackKeys.set(URL, key);
            return true;
        }

        return false;
    }

    /**
     * Checks the contract for traceability by this follower contract. In order for the contract to be followed by
     * this follower contract, it is necessary that one of the conditions be fulfilled:
     * 1) Owner role of the contract is allowed for keys that signed this follower contract;
     * 2) One of the roles in the field data.follower_roles (in the sections definition, state or transactional) of
     *    the contract is allowed for keys that signed this follower contract.
     *
     * @param {Contract} contract - Contract id {@link Contract} for traceability checking.
     * @return {boolean} true if {@link Contract} can be follow by this {@link FollowerContract}.
     */
    canFollowContract(contract) {
    // check for contract owner
    /*let owner = contract.getOwner();
    if (owner.isAllowedForKeys(getSealedByKeys()))
        return true;

    // check for roles from field data.follower_roles in all sections of contract
    List<String> sections = Arrays.asList("definition", "state", "transactional");

    return (sections.stream().anyMatch(section -> {
        try {
            Object followerRoles = contract.get(section + ".data." + FOLLOWER_ROLES_FIELD_NAME);
            if (((followerRoles != null) && followerRoles instanceof Collection) &&
                (((Collection)followerRoles).stream().anyMatch(r -> {
                    Role role;
                    if (r instanceof Binder)
                        role = new BiDeserializer().deserialize((Binder) r);
                    else if (r instanceof Role)
                        role = (Role) r;
                    else
                        return false;

                    if ((!(role instanceof Role)) || ((role instanceof RoleLink) && (role.getContract() == null)))
                        return false;
                    return role.isAllowedForKeys(getSealedByKeys());
                })))
            return true;
        } catch (Exception e) {} // no followable roles in <section>.data

        return false;
    }));*/
    }

    /**
     * It is private method that looking for U contract in the new items of this follower contract. Then calculates
     * new payment, looking for already paid, summize it and calculate new prepaid period for following, that sets to
     * {@link FollowerContract#prepaidOriginDays}. This field is measured in the origins*days, means how many origins
     * can follow for how many days.
     * But if withSaveToState param is false, calculated value do not saving to state.
     * It is useful for checking set state.data values.
     *
     * @param {boolean} withSaveToState - If true, calculated values is saving to state.data.
     * @return {number} calculated {@link FollowerContract#calculatePrepaidOriginDays}.
     */
    calculatePrepaidOriginDays(withSaveToState) {

        this.paidU = this.getPaidU();

        if (this.callbackRate === 0)
            this.callbackRate = this.getRate("callback");

        // then looking for prepaid early U that can be find at the stat.data
        // additionally we looking for and calculate times of payment fillings and some other data
        let now = Math.floor(Date.now() / 1000);
        let wasPrepaidOriginDays;
        let wasPrepaidFrom = now;
        let spentEarlyODsTimeSecs = now;
        let parentContract = this.getRevokingItem(this.state.parent);
        if(parentContract != null) {
            wasPrepaidOriginDays = t.getOrDefault(parentContract.state.data, FollowerContract.PREPAID_OD_FIELD_NAME, 0);
            wasPrepaidFrom = t.getOrDefault(parentContract.state.data, FollowerContract.PREPAID_FROM_TIME_FIELD_NAME, now);
            this.storedEarlyOrigins = t.getOrDefault(parentContract.state.data, FollowerContract.FOLLOWED_ORIGINS_FIELD_NAME, 0);
            this.spentEarlyODs = t.getOrDefault(parentContract.state.data, FollowerContract.SPENT_OD_FIELD_NAME, 0);
            spentEarlyODsTimeSecs = t.getOrDefault(parentContract.state.data, FollowerContract.SPENT_OD_TIME_FIELD_NAME, now);
        } else {
            wasPrepaidOriginDays = 0;
        }

        this.spentEarlyODsTime = new Date(spentEarlyODsTimeSecs * 1000);
        this.prepaidFrom = new Date(wasPrepaidFrom * 1000);
        this.prepaidOriginDays = wasPrepaidOriginDays + this.paidU * this.getRate();  //TODO:

        this.spentODsTime = new Date();

        let spentSeconds = Math.floor((this.spentODsTime.getTime() - this.spentEarlyODsTime.getTime()) / 1000);
        let spentDays = spentSeconds / (3600 * 24);
        this.spentODs = this.spentEarlyODs + spentDays * this.storedEarlyOrigins;

        // if true we save it to stat.data
        if (withSaveToState) {
            this.state.data[FollowerContract.PAID_U_FIELD_NAME] = this.paidU;

            this.state.data[FollowerContract.PREPAID_OD_FIELD_NAME] = this.prepaidOriginDays;
            if(this.state.revision() === 1)
                this.state.data[FollowerContract.PREPAID_FROM_TIME_FIELD_NAME] = now;

            this.state.data[FollowerContract.FOLLOWED_ORIGINS_FIELD_NAME] = this.trackingOrigins.size;

            this.state.data[FollowerContract.SPENT_OD_FIELD_NAME] = this.spentODs;
            this.state.data[FollowerContract.SPENT_OD_TIME_FIELD_NAME] = this.spentODsTime;

            this.state.data[FollowerContract.CALLBACK_RATE_FIELD_NAME] = this.callbackRate;
        }

        return this.prepaidOriginDays;
    }

    /**
     * Own private follower's method for saving subscription. It calls from
     * {@link FollowerContract#onContractSubscriptionEvent(ContractSubscription.Event)} (when tracking contract chain
     * have registered new revision, from {@link FollowerContract#onCreated(MutableEnvironment)} and from
     * {@link FollowerContract#onUpdated(MutableEnvironment)} (both when this follower contract have registered new revision).
     * It recalculate params of follower contract and update expiring and muting times for each subscription at the ledger.
     * @param {MutableEnvironment} me - MutableEnvironment object with some data.
     */
    updateSubscriptions(me) {
        // recalculate prepaid origins*days without saving to state
        this.calculatePrepaidOriginDays(false);

        let fs = me.getFollowerService(true);

        // recalculate time that will be added to now as new expiring time
        // it is difference of all prepaid ODs (origins*days) and already spent divided to new number of tracking origins.
        let days = (this.prepaidOriginDays - this.spentODs - fs.getCallbacksSpent()) / this.trackingOrigins.size;
        let milliseconds = days * 24 * 3600 * 1000;
        let newExpires = new Date(Date.now() + milliseconds);
        newExpires.setMilliseconds(0);

        // recalculate muted period of follower contract subscription
        days = (fs.getStartedCallbacks() + 1) * this.callbackRate / this.trackingOrigins.size;
        milliseconds = days * 24 * 3600 * 1000;
        let newMuted = new Date(newExpires - milliseconds);   //TODO
        newMuted.setMilliseconds(0);

        fs.setExpiresAndMutedAt(newExpires, newMuted);

        let newOrigins = new Set(this.trackingOrigins.key); //TODO ?

        me.subscriptions().forEach(sub => {
            let origin = sub.getOrigin();
            if (newOrigins.has(origin)) {
                me.setSubscriptionExpiresAt(sub, newExpires);
            newOrigins.delete(origin);
            } else
                me.destroySubscription(sub);
        });

        newOrigins.forEach(origin => me.createChainSubscription(origin, newExpires));
    }

    /**
     * Get calculated prepaid origins*days for this follower contract
     *
     * @return {BigDecimal} calculated prepaid origins*days for all time, from first revision
     */
    getPrepaidOriginsDays() {
        return new BigDecimal(this.prepaidOriginDays);
    }

    onContractSubscriptionEvent(event) {
        let me = event.getEnvironment();
        let fs = me.getFollowerService(true);

        if (event instanceof events.ApprovedWithCallbackEvent) {
            if (fs.mutedAt.getTime() < new Date.now())
                return;

            fs.increaseStartedCallbacks();

            // decrease muted period of all follower subscription in environment of contract
            let deltaDays = -this.callbackRate / this.trackingOrigins.size;
            let deltaSeconds = deltaDays * 24 * 3600;

            fs.changeMutedAt(deltaSeconds);

            // schedule callback processor
            let callbackService = event.getCallbackService();
            fs.scheduleCallbackProcessor(event.getNewRevision(), ItemState.APPROVED, this, me, callbackService);

        } else if (event instanceof events.RevokedWithCallbackEvent) {
            if (fs.mutedAt.getTime()  < Date.now())
                return;

            fs.increaseStartedCallbacks();

            // decrease muted period of all follower subscription in environment of contract
            let deltaDays = -this.callbackRate / this.trackingOrigins.size;
            let deltaSeconds = deltaDays * 24 * 3600;

            fs.changeMutedAt(deltaSeconds);

            // schedule callback processor
            let callbackService = event.getCallbackService();
            fs.scheduleCallbackProcessor(event.getRevokingItem(), ItemState.REVOKED, this, me, callbackService);

        } else if (event instanceof events.CompletedEvent) {
            fs.decreaseStartedCallbacks();
            fs.increaseCallbacksSpent(this.callbackRate);

            // decrease expires period of all follower subscription in environment of contract
            let deltaDays = this.callbackRate / this.trackingOrigins.size;
            let deltaSeconds = deltaDays * 24 * 3600;

            fs.decreaseExpiresAt(deltaSeconds);
            me.subscriptions().forEach(sub => me.setSubscriptionExpiresAt(sub, sub.expiresAt - minusSeconds(deltaSeconds)));

        }else if (event instanceof events.FailedEvent) {
            fs.decreaseStartedCallbacks();

            // increase muted period of all follower subscription in environment of contract
            let deltaDays = this.callbackRate / this.trackingOrigins.size;
            let deltaSeconds = deltaDays * 24 * 3600;

            fs.changeMutedAt(deltaSeconds);

        } else if (event instanceof events.SpentEvent) {
            fs.increaseCallbacksSpent(this.callbackRate);

            let deltaDays = this.callbackRate / this.trackingOrigins.size;
            let deltaSeconds = deltaDays * 24 * 3600;

            // decrease muted and expires period of all follower subscription in environment of contract
            fs.changeMutedAt(-deltaSeconds);
            fs.decreaseExpiresAt(deltaSeconds);
            me.subscriptions().forEach(sub => me.setSubscriptionExpiresAt(sub, sub.expiresAt().minusSeconds(deltaSeconds)));
        }
    }

    /**
     * Override seal method to recalculate holding at the state.data values.
     */
    seal(isTransactionRoot = false) {
        this.saveTrackingOriginsToState();
        this.calculatePrepaidOriginDays(true);

        return super.seal(isTransactionRoot);
    }

    saveTrackingOriginsToState() {
        let origins = {};

        this.trackingOrigins.forEach((entry => origins[entry.key.base64] = entry.value));
        this.state.data[FollowerContract.TRACKING_ORIGINS_FIELD_NAME] = origins;

        let callbacks = {};

        this.callbackKeys.forEach((entry => callbacks[entry.key] = entry.value.pack));
        this.state.data[FollowerContract.CALLBACK_KEYS_FIELD_NAME] = callbacks;

    }

    deserialize(data, deserializer) {
        super.deserialize(data, deserializer);

        this.deserializeForFollower();
    }

    /**
     * Extract values from deserializing object for follower fields.
     */
    deserializeForFollower() {

        /*if(this.trackingOrigins == null)  //TODO ==
            this.trackingOrigins = new Map();
        else
            this.trackingOrigins.clear();

        if(this.callbackKeys == null)
            this.callbackKeys = new Map();
        else
            this.callbackKeys.clear();*/

        // extract paided U
        this.paidU = t.getOrDefault(this.state.data, FollowerContract.PAID_U_FIELD_NAME, 0);

        // extract saved rate of callback price for current revision
        this.callbackRate = this.state.data[FollowerContract.CALLBACK_RATE_FIELD_NAME];

        // extract saved prepaid OD (origins*days) value
        this.prepaidOriginDays = t.getOrDefault(this.state.data, FollowerContract.PREPAID_OD_FIELD_NAME, 0);

        // and extract time when first time payment was
        let prepaidFromSeconds = t.getOrDefault(this.state.data, FollowerContract.PREPAID_FROM_TIME_FIELD_NAME, 0);
        this.prepaidFrom = new Date(prepaidFromSeconds * 1000);

        // extract tracking origins nad callbacks data
        let trackingOriginsAsBase64 = this.state.data[FollowerContract.TRACKING_ORIGINS_FIELD_NAME];
        let callbacksData = this.state.data[FollowerContract.CALLBACK_KEYS_FIELD_NAME];

        for (let URL of Object.keys(callbacksData)) {
            let packedKey = callbacksData[URL];
            let key = new crypto.PublicKey(packedKey);
            this.callbackKeys.set(URL, key);
        }

        for (let s of Object.keys(trackingOriginsAsBase64)) {
            let URL = trackingOriginsAsBase64[s];
            let origin = crypto.HashId.withBase64Digest(s); //TODO

            if (this.callbackKeys.has(URL))
                this.trackingOrigins.set(origin, URL);
        }
    }

    /**
     * Callback called by the node before registering the follower contract for his check.
     *
     * @param {ImmutableEnvironment} c - Object with some data.
     * @return {boolean} result.
     */
    beforeCreate(c) {
        let checkResult = true;

        // recalculate prepaid origins*days without saving to state
        this.calculatePrepaidOriginDays(false);

        if (this.paidU === 0) {
            if (this.getPaidU(true) > 0)             //TODO
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Test payment is not allowed for follower contracts"));
            checkResult = false;
        } else if(this.paidU < this.getMinPayment()) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Payment for follower contract is below minimum level of " + this.getMinPayment() + "U"));
            checkResult = false;
        }

        if(!checkResult) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Follower contract hasn't valid payment"));
            return false;
        }

        // check that payment was not hacked
        if(this.prepaidOriginDays !== t.getOrDefault(this.state.data, FollowerContract.PREPAID_OD_FIELD_NAME, 0)) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Wrong [state.data." + FollowerContract.PREPAID_OD_FIELD_NAME + "] value. " +
                "Should be sum of early paid U and paid U by current revision."));
            return false;
        }

        // and call common follower check
        return this.additionallyFollowerCheck(c);
    }

    /**
     * Callback called by the node before registering new revision of the follower contract for his check.
     *
     * @param {ImmutableEnvironment} c - Object with some data.
     * @return {boolean} result.
     */
    beforeUpdate(c) {
        // recalculate prepaid origins*days without saving to state
        this.calculatePrepaidOriginDays(false);

        // check that payment was not hacked
        if(this.prepaidOriginDays === this.state.data[FollowerContract.PREPAID_OD_FIELD_NAME])
            // and call common follower check
            return this.additionallyFollowerCheck(c);

        this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Wrong [state.data." + this.state.data[FollowerContract.PREPAID_OD_FIELD_NAME] + "] value. " +
            "Should be sum of early paid U and paid U by current revision."));

        return false;
    }

    /**
     * Callback called by the node before revocation the follower contract for his check.
     *
     * @param {ImmutableEnvironment} c - Object with some data.
     * @return {boolean} result.
     */
    beforeRevoke(c) {
        return this.additionallyFollowerCheck(c);
    }

    /**
     * Additionally check the follower contract.
     *
     * @param {ImmutableEnvironment} ime - Object with some data.
     */
    additionallyFollowerCheck(ime) {
        // check follower environment
        if (ime == null) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Environment should be not null"));
            return false;
        }

        // check that follower has known and valid type of smart contract
        if(this.definition.extendedType !== NSmartContract.SmartContractType.FOLLOWER1) {
            this.errors.push(new ErrorRecord (ErrorRecord(Errors.FAILED_CHECK, "definition.extended_type",
                "illegal value, should be " + NSmartContract.SmartContractType.FOLLOWER1 + " instead " + this.definition.extendedType)));
            return false;
        }

        // check for tracking origins existing
        let tracking = this.trackingOrigins.size > 0;
        if(tracking == 0) {                             // TODO
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Tracking origin is missed"));
            return false;
        }

        // check for any tracking origin contains callbacks data // TODO delete containsValue
        /*for (let URL of this.trackingOrigins.values)
            if (!this.callbackKeys.has(URL))
                checkResult = false;

        if(!checkResult) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "Callback key for tracking origin is missed"));
            return checkResult;
        }
            return checkResult;
        */
    }

    /**
     * Callback called by the node after registering the follower contract.
     *
     * @param {MutableEnvironment} me - Object with some data.
     * @return {Object} object contains operation status.
     */
    onCreated(me) {
        this.updateSubscriptions(me);

        return {status : "ok"};
    }

    /**
     * Callback called by the node after registering new revision of the follower contract.
     *
     * @param {MutableEnvironment} me - Object with some data.
     * @return {Object} object contains operation status.
     */
    onUpdated(me) {
        this.updateSubscriptions(me);

        return {status : "ok"};
    }

    /**
     * Callback called by the node after revocation the follower contract.
     *
     * @param {ImmutableEnvironment} ime - Object with some data.
     */
    onRevoked(ime) {}
}

module.exports = {FollowerContract};