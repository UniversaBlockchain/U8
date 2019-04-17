const BigDecimal  = require("big").Big;

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

        this.paidU = 0;
        this.prepaidOriginDays = 0;
        this.prepaidFrom = null;
        this.storedEarlyOrigins = 0;
        this.spentEarlyODs = 0;
        this.spentEarlyODsTime = null;
        this.spentODs = 0;
        this.spentODsTime = null;
        this.callbackRate = 0;

        this.errors = [];

    }

    /**
     * Method adds follower's specific to contract:
     */
     addFollowerSpecific() {
        if(this.definition.extendedType == null || !this.definition.extendedType().equals(SmartContractType.FOLLOWER1.name()))
            this.definition.extendedType(SmartContractType.FOLLOWER1.name());

        let ownerLink = new RoleLink("owner_link", "owner");
        this.registerRole(ownerLink);

        let fieldsMap = new Map();

        fieldsMap.set("action", null);
        fieldsMap.set("/expires_at", null);
        fieldsMap.set(this.PAID_U_FIELD_NAME, null);
        fieldsMap.set(this.PREPAID_OD_FIELD_NAME, null);
        fieldsMap.set(this.PREPAID_FROM_TIME_FIELD_NAME, null);
        fieldsMap.set(this.FOLLOWED_ORIGINS_FIELD_NAME, null);
        fieldsMap.set(this.SPENT_OD_FIELD_NAME, null);
        fieldsMap.set(this.SPENT_OD_TIME_FIELD_NAME, null);
        fieldsMap.set(this.CALLBACK_RATE_FIELD_NAME, null);
        fieldsMap.set(this.TRACKING_ORIGINS_FIELD_NAME, null);
        fieldsMap.set(this.CALLBACK_KEYS_FIELD_NAME, null);

        let modifyDataParams = new Map("fields", fieldsMap);
        let modifyDataPermission = new ModifyDataPermission(ownerLink, modifyDataParams);

        this.addPermission(modifyDataPermission);
    }

    /**
     * Method calls from {@link FollowerContract#fromDslFile(String)} and initialize contract from given binder.
     *
     * @param root id binder with initialized data
     * @return created and ready {@link FollowerContract} contract.
     */
    initializeWithDsl(root) {
        super.initializeWithDsl(root);
        return this;
    }

    /**
     * Method creates {@link FollowerContract} contract from dsl file where contract is described.
     *
     * @param fileName is path to dsl file with yaml structure of data for contract.
     * @return created and ready {@link FollowerContract} contract.
     */
    /*FollowerContract fromDslFile(fileName) {
        Yaml yaml = new Yaml();
        try (FileReader r = new FileReader(fileName)) {
            Binder binder = Binder.from(DefaultBiMapper.deserialize((Map) yaml.load(r)));
        return new FollowerContract().initializeWithDsl(binder);
    }*/

    /**
     * Check whether the origin is tracked in the follower contract.
     *
     * @param {HashId} origin - Origin to check.
     * @return {boolean} true if origin is tracking.
     */
    isOriginTracking(origin) {
        if (this.trackingOrigins != null)
            return this.trackingOrigins.containsKey(origin);

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
     *
     * @return {boolean} true if {@link Contract} can be follow by this {@link FollowerContract}.
     */
    canFollowContract(contract) {
    /*// check for contract owner
    let owner = contract.getOwner();
    if (contract.owner.isAllowedForKeys(getSealedByKeys()))
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
     *
     * @return {number} calculated {@link FollowerContract#calculatePrepaidOriginDays}.
     */
    calculatePrepaidOriginDays(withSaveToState) {

/*    paidU = getPaidU();

    if (callbackRate == 0)
    callbackRate = getRate("callback").doubleValue();

    // then looking for prepaid early U that can be find at the stat.data
    // additionally we looking for and calculate times of payment fillings and some other data
    ZonedDateTime now = ZonedDateTime.ofInstant(Instant.ofEpochSecond(ZonedDateTime.now().toEpochSecond()), ZoneId.systemDefault());
    double wasPrepaidOriginDays;
    long wasPrepaidFrom = now.toEpochSecond();
    long spentEarlyODsTimeSecs = now.toEpochSecond();
    Contract parentContract = getRevokingItem(getParent());
    if(parentContract != null) {
    wasPrepaidOriginDays = parentContract.getStateData().getDouble(PREPAID_OD_FIELD_NAME);
    wasPrepaidFrom = parentContract.getStateData().getLong(PREPAID_FROM_TIME_FIELD_NAME, now.toEpochSecond());
    storedEarlyOrigins = parentContract.getStateData().getLong(FOLLOWED_ORIGINS_FIELD_NAME, 0);
    spentEarlyODs = parentContract.getStateData().getDouble(SPENT_OD_FIELD_NAME);
    spentEarlyODsTimeSecs = parentContract.getStateData().getLong(SPENT_OD_TIME_FIELD_NAME, now.toEpochSecond());
} else {
    wasPrepaidOriginDays = 0;
}

spentEarlyODsTime = ZonedDateTime.ofInstant(Instant.ofEpochSecond(spentEarlyODsTimeSecs), ZoneId.systemDefault());
prepaidFrom = ZonedDateTime.ofInstant(Instant.ofEpochSecond(wasPrepaidFrom), ZoneId.systemDefault());
prepaidOriginDays = wasPrepaidOriginDays + paidU * getRate().doubleValue();

spentODsTime = now;

long spentSeconds = (spentODsTime.toEpochSecond() - spentEarlyODsTime.toEpochSecond());
double spentDays = (double) spentSeconds / (3600 * 24);
spentODs = spentEarlyODs + spentDays * storedEarlyOrigins;

// if true we save it to stat.data
if(withSaveToState) {
    getStateData().set(PAID_U_FIELD_NAME, paidU);

    getStateData().set(PREPAID_OD_FIELD_NAME, prepaidOriginDays);
    if(getRevision() == 1)
        getStateData().set(PREPAID_FROM_TIME_FIELD_NAME, now.toEpochSecond());

    getStateData().set(FOLLOWED_ORIGINS_FIELD_NAME, trackingOrigins.size());

    getStateData().set(SPENT_OD_FIELD_NAME, spentODs);
    getStateData().set(SPENT_OD_TIME_FIELD_NAME, spentODsTime.toEpochSecond());

    getStateData().set(CALLBACK_RATE_FIELD_NAME, callbackRate);
}

return prepaidOriginDays;*/
}

    /**
     * Own private follower's method for saving subscription. It calls from
     * {@link FollowerContract#onContractSubscriptionEvent(ContractSubscription.Event)} (when tracking contract chain
     * have registered new revision, from {@link FollowerContract#onCreated(MutableEnvironment)} and from
     * {@link FollowerContract#onUpdated(MutableEnvironment)} (both when this follower contract have registered new revision).
     * It recalculate params of follower contract and update expiring and muting times for each subscription at the ledger.
     *
     * @param {MutableEnvironment} me - MutableEnvironment object with some data.
     */
    updateSubscriptions(me) {

   /* // recalculate prepaid origins*days without saving to state
    calculatePrepaidOriginDays(false);

    FollowerService fs = me.getFollowerService(true);

    // recalculate time that will be added to now as new expiring time
    // it is difference of all prepaid ODs (origins*days) and already spent divided to new number of tracking origins.
    double days = (prepaidOriginDays - spentODs - fs.getCallbacksSpent()) / trackingOrigins.size();
    long seconds = (long) (days * 24 * 3600);
    ZonedDateTime newExpires = ZonedDateTime.ofInstant(Instant.ofEpochSecond(ZonedDateTime.now().toEpochSecond()), ZoneId.systemDefault())
        .plusSeconds(seconds);

    // recalculate muted period of follower contract subscription
    days = (fs.getStartedCallbacks() + 1) * callbackRate / trackingOrigins.size();
    seconds = (long) (days * 24 * 3600);
    ZonedDateTime newMuted = newExpires.minusSeconds(seconds);

    fs.setExpiresAndMutedAt(newExpires, newMuted);

    Set<HashId> newOrigins = new HashSet<>(trackingOrigins.keySet());

    me.subscriptions().forEach(sub -> {
    HashId origin = sub.getOrigin();
    if (newOrigins.contains(origin)) {
    me.setSubscriptionExpiresAt(sub, newExpires);
    newOrigins.remove(origin);
} else
me.destroySubscription(sub);
});

for (HashId origin: newOrigins) {
    try {
        ContractSubscription sub = me.createChainSubscription(origin, newExpires);
    } catch (Exception e) {
        e.printStackTrace();
    }
}*/
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

/*    MutableEnvironment me = event.getEnvironment();
    FollowerService fs = me.getFollowerService(true);

    if (event instanceof ContractSubscription.ApprovedWithCallbackEvent) {
    if (fs.mutedAt().isBefore(ZonedDateTime.now()))
    return;

    fs.increaseStartedCallbacks();

    // decrease muted period of all follower subscription in environment of contract
    double deltaDays = -callbackRate / trackingOrigins.size();
    int deltaSeconds = (int) (deltaDays * 24 * 3600);

    fs.changeMutedAt(deltaSeconds);

    // schedule callback processor
    CallbackService callbackService = ((ContractSubscription.ApprovedWithCallbackEvent) event).getCallbackService();
    fs.scheduleCallbackProcessor(((ContractSubscription.ApprovedWithCallbackEvent) event).getNewRevision(),
    ItemState.APPROVED, this, me, callbackService);

} else if (event instanceof ContractSubscription.RevokedWithCallbackEvent) {
    if (fs.mutedAt().isBefore(ZonedDateTime.now()))
        return;

    fs.increaseStartedCallbacks();

    // decrease muted period of all follower subscription in environment of contract
    double deltaDays = -callbackRate / trackingOrigins.size();
    int deltaSeconds = (int) (deltaDays * 24 * 3600);

    fs.changeMutedAt(deltaSeconds);

    // schedule callback processor
    CallbackService callbackService = ((ContractSubscription.RevokedWithCallbackEvent) event).getCallbackService();
    fs.scheduleCallbackProcessor(((ContractSubscription.RevokedWithCallbackEvent) event).getRevokingItem(),
        ItemState.REVOKED, this, me, callbackService);

} else if (event instanceof ContractSubscription.CompletedEvent) {
    fs.decreaseStartedCallbacks();
    fs.increaseCallbacksSpent(callbackRate);

    // decrease expires period of all follower subscription in environment of contract
    double deltaDays = callbackRate / trackingOrigins.size();
    int deltaSeconds = (int) (deltaDays * 24 * 3600);

    fs.decreaseExpiresAt(deltaSeconds);
    me.subscriptions().forEach(sub -> me.setSubscriptionExpiresAt(sub, sub.expiresAt().minusSeconds(deltaSeconds)));

} else if (event instanceof ContractSubscription.FailedEvent) {
    fs.decreaseStartedCallbacks();

    // increase muted period of all follower subscription in environment of contract
    double deltaDays = callbackRate / trackingOrigins.size();
    int deltaSeconds = (int) (deltaDays * 24 * 3600);

    fs.changeMutedAt(deltaSeconds);

} else if (event instanceof ContractSubscription.SpentEvent) {
    fs.increaseCallbacksSpent(callbackRate);

    double deltaDays = callbackRate / trackingOrigins.size();
    int deltaSeconds = (int) (deltaDays * 24 * 3600);

    // decrease muted and expires period of all follower subscription in environment of contract
    fs.changeMutedAt(-deltaSeconds);
    fs.decreaseExpiresAt(deltaSeconds);
    me.subscriptions().forEach(sub -> me.setSubscriptionExpiresAt(sub, sub.expiresAt().minusSeconds(deltaSeconds)));
}*/
}

    /**
     * We override seal method to recalculate holding at the state.data values
     *
     * @return {number[]}
     */
    seal() {
        this.saveTrackingOriginsToState();
        this.calculatePrepaidOriginDays(true);

        return super.seal();
    }

    saveTrackingOriginsToState() {
       /* Binder origins = new Binder();
        for (Map.Entry<HashId, String> entry: trackingOrigins.entrySet()) {
            origins.set(entry.getKey().toBase64String(), entry.getValue());
        }
        getStateData().set(TRACKING_ORIGINS_FIELD_NAME, origins);

        Binder callbacks = new Binder();
        for (Map.Entry<String, PublicKey> entry: callbackKeys.entrySet()) {
            callbacks.set(entry.getKey(), entry.getValue().pack());
        }
        getStateData().set(CALLBACK_KEYS_FIELD_NAME, callbacks);*/
    }

    deserialize(data, deserializer) {
    super.deserialize(data, deserializer);

    this.deserializeForFollower();
    }

    /**
     * Extract values from deserializing object for follower fields.
     */
    deserializeForFollower() {

   /*     if(this.trackingOrigins == null)
            this.trackingOrigins = new Map();
        else
            this.trackingOrigins.clear();

        if(this.callbackKeys == null)
            this.callbackKeys = new HashMap();
        else
            this.callbackKeys.clear();

        // extract paided U
        this.paidU = getStateData().getInt(PAID_U_FIELD_NAME, 0);

        // extract saved rate of callback price for current revision
        callbackRate = getStateData().getDouble(CALLBACK_RATE_FIELD_NAME);

        // extract saved prepaid OD (origins*days) value
        prepaidOriginDays = getStateData().getInt(PREPAID_OD_FIELD_NAME, 0);

        // and extract time when first time payment was
        long prepaidFromSeconds = getStateData().getLong(PREPAID_FROM_TIME_FIELD_NAME, 0);
        prepaidFrom = ZonedDateTime.ofInstant(Instant.ofEpochSecond(prepaidFromSeconds), ZoneId.systemDefault());

        // extract tracking origins nad callbacks data
        Binder trackingOriginsAsBase64 = getStateData().getBinder(TRACKING_ORIGINS_FIELD_NAME);
        Binder callbacksData = getStateData().getBinder(CALLBACK_KEYS_FIELD_NAME);

        for (String URL: callbacksData.keySet()) {
            byte[] packedKey = callbacksData.getBinary(URL);
            try {
                PublicKey key = new PublicKey(packedKey);
                callbackKeys.put(URL, key);
            } catch (EncryptionError encryptionError) {}
        }

        for (String s: trackingOriginsAsBase64.keySet()) {
            String URL = trackingOriginsAsBase64.getString(s);
            HashId origin = HashId.withDigest(s);

            if (callbackKeys.containsKey(URL))
                trackingOrigins.put(origin, URL);
        }*/
    }


    beforeCreate( c) {

   /* boolean checkResult = true;

    // recalculate prepaid origins*days without saving to state
    calculatePrepaidOriginDays(false);

    int paidU = getPaidU();
    if(paidU == 0) {
    if(getPaidU(true) > 0) {
    addError(Errors.FAILED_CHECK, "Test payment is not allowed for follower contracts");
}
checkResult = false;
} else if(paidU < getMinPayment()) {
    addError(Errors.FAILED_CHECK, "Payment for follower contract is below minimum level of " + getMinPayment() + "U");
    checkResult = false;
}

if(!checkResult) {
    addError(Errors.FAILED_CHECK, "Follower contract hasn't valid payment");
    return checkResult;
}

// check that payment was not hacked
checkResult = prepaidOriginDays == getStateData().getInt(PREPAID_OD_FIELD_NAME, 0);
if(!checkResult) {
    addError(Errors.FAILED_CHECK, "Wrong [state.data." + PREPAID_OD_FIELD_NAME + "] value. " +
        "Should be sum of early paid U and paid U by current revision.");
    return checkResult;
}

// and call common follower check
checkResult = additionallyFollowerCheck(c);

return checkResult;*/
}

    /**
     *
     * @param {ImmutableEnvironment} c
     * @return {boolean}
     */
    beforeUpdate(c) {
        let checkResult = false;

        // recalculate prepaid origins*days without saving to state
        this.calculatePrepaidOriginDays(false);

        // check that payment was not hacked
        checkResult = this.prepaidOriginDays === this.state.data[PREPAID_OD_FIELD_NAME];
        if(!checkResult) {
            this.errors.push(new Errors.FAILED_CHECK, "Wrong [state.data." + PREPAID_OD_FIELD_NAME + "] value. " +
                "Should be sum of early paid U and paid U by current revision.");

            return checkResult;
        }

        // and call common follower check
        checkResult = this.additionallyFollowerCheck(c);

        return checkResult;
    }

    beforeRevoke(c) {
        return this.additionallyFollowerCheck(c);
    }

    additionallyFollowerCheck(ime) {
       /* let checkResult = false;

        // check slot environment
        checkResult = ime != null;
        if(!checkResult) {
            this.errors.push(new Errors.FAILED_CHECK, "Environment should be not null");
            return checkResult;
        }

        // check that slot has known and valid type of smart contract
        checkResult = getExtendedType().equals(SmartContractType.FOLLOWER1.name());
        if(!checkResult) {
            this.errors.push(new Errors.FAILED_CHECK, "definition.extended_type", "illegal value, should be " + SmartContractType.FOLLOWER1.name() + " instead " + getExtendedType());
            return checkResult;
        }

        // check for tracking origins existing
        checkResult = trackingOrigins.size() > 0;
        if(!checkResult) {
            this.errors.push(new Errors.FAILED_CHECK, "Tracking origin is missed");
            return checkResult;
        }

        // check for any tracking origin contains callbacks data
        checkResult = true;
        for (String URL: trackingOrigins.values())
            if (!callbackKeys.containsKey(URL))
                checkResult = false;
            if(!checkResult) {
                this.errors.push(new Errors.FAILED_CHECK, "Callback key for tracking origin is missed");
            return checkResult;
            }

        return checkResult;*/
    }

    onCreated(me) {
        this.updateSubscriptions(me);

        return {status : "ok"};
    }

    onUpdated(me) {
        this.updateSubscriptions(me);

        return {status : "ok"};
    }

    onRevoked(ime) {}
}

module.exports = {FollowerContract};