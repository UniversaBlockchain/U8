const BigDecimal  = require("big").Big;

class Config {
    static quantiser_quantaPerU = 200;
    static paymentQuantaLimit = 200;
    static maxExpirationDaysInTestMode = 365;
    static maxCostUInTestMode = 3;
    static validUntilTailTime = 5*60; //5 minutes
    static maxItemCreationAge = 5*24*3600; //5 days
    static maxElectionsTime = 15*60; //15 minutes
    static maxResyncTime = 5*60; //5 minutes
    static maxCacheAge = 20*60; //20 minutes
    static maxDiskCacheAge = 40*60; // 40 minutes
    static maxNameCacheAge = 5*60; //5 minutes
    static resyncTime = [0, 1000, 1000, 1000, 2000, 4000, 8000, 16000, 32000, 60000];
    static pollTimeMillis = [0, 1000, 1000, 1000, 2000, 4000, 8000, 16000, 32000, 60000];
    static consensusReceivedCheckTime = [0, 1000, 1000, 1000, 2000, 4000, 8000, 16000, 32000, 60000];
    static maxConsensusReceivedCheckTime = 15*60; //15 minutes
    static revokedItemExpiration = Config.maxItemCreationAge + 10*24*3600; //maxItemCreationAge + 10 days
    static declinedItemExpiration = 10*24*3600; //10 days
    static maxGetItemTime = 30; //30 seconds
    static maxDownloadOnApproveTime = 5*60; //5 minutes
    static getItemRetryCount = 10;
    static expriedStorageCleanupInterval = 5*60; //5 minutes
    static expriedNamesCleanupInterval = 5*60; //5 minutes

    /**
     * num of known (approved, declined, revoked or locked) subcontracts of a complex contract that starts resync
     * if some another contracts is unknown
     */
    static knownSubContractsToResync = 1;

    static rateLimitDisablingPayment = 5;
    static limitRequestsForKeyPerMinute = 30;
    static unlimitPeriod = 5*60; //5 minutes

    // SmartContract services
    static rate = {
        SLOT1: new BigDecimal(4),
        UNS1: new BigDecimal(0.25),
        FOLLOWER1: new BigDecimal(1),
        "FOLLOWER1:callback": new BigDecimal(1)
    };

    static minPayment = {
        SLOT1: 100,
        UNS1: Math.ceil(365 / Config.rate.UNS1),
        FOLLOWER1: 100,
    };

    static uIssuerName = "Universa Reserve System";
    static authorizedNameServiceCenterKey = new crypto.PublicKey(atob("HggcAQABxAABg9ideX6A3Wk9CuwnZrakXdvhYDiIiO0HA+YWmLArcZvhhaGMrw1i1mA6S9L6NPAuhYcZzm8Mxtwr1RESyJqm+HFwU+49s0yXHhCJsXcvK23Yx7NEpIrpGkKt9OCCdBGhQkls0Yc1lBBmGYCrShMntPC9xY9DJZ4sbMuBPIUQzpnWLYgRAbZb+KuZFXAIr7hRO0rNTZ6hE5zp6oPwlQLh9hBy6CsvZD/73Cf2WtKDunHD1qKuQU/KqruqVMMv2fd6ZKo692esWsqqIAiQztg1+sArAhf0Cr8lhRf53G5rndiiQx7RDs1P9Pp1wWK9e93UL1KF4PpVx7e7SznrCHTEdw"));
    static networkAdminKeyAddress = new crypto.KeyAddress("bVmSQXWM7WvUtgcitUtjRd42WRbLycvsfPaRimpSNY3yZMUrVvEHV6mwb8A2DrKnzi795kJB");

    constructor() {
        this.isFreeRegistrationsAllowedFromYaml = false;
        this.isFreeRegistrationsLimited = null;
        this.keysWhiteList = [];
        this.addressesWhiteList = [];
        this.uIssuerKeys = [
            new crypto.KeyAddress("ZNuBikFEZbw71QQAFkNQtjfkmxFAdMgveTVPMGrFwo9vQwwPVE"),
            new crypto.KeyAddress("J3uaVvHE7JqhvVb1c26RyDhfJw9eP2KR1KRhm2VdmYx7NwHpzdHTyEPjcmKpgkJAtzWLSPUw")
        ];
        this.main = null;
        this.holdDuration = 30*24*3600; // 30 days

        // Permanet mode
        this.permanetMode = false;
        this.queryContractsLimit = 100;

        // Follower callback service
        this.followerCallbackExpiration = 10*60; //10 minutes
        this.followerCallbackDelay = 10;
        this.followerCallbackStateStoreTime = 3*24*3600; // 3 days
        this.followerCallbackSynchronizationInterval = 12*3600; // 12 hours
        this.ratioNodesSendFollowerCallbackToComplete = new BigDecimal(0.3);
    }

    /**
     * Update network consensus.
     *
     * @param {number} n - Number of nodes in network.
     */
    updateConsensus(n) {
        this.negativeConsensus = Math.ceil(n * 0.11);
        if (this.negativeConsensus < 1)
            this.negativeConsensus = 1;
        this.positiveConsensus = Math.floor(n * 0.90);
        if (this.negativeConsensus + this.positiveConsensus === n)
            this.negativeConsensus += 1;
        this.resyncBreakConsensus = Math.ceil(n * 0.2);
        if (this.resyncBreakConsensus < 1)
            this.resyncBreakConsensus = 1;
        if (this.resyncBreakConsensus + this.positiveConsensus === n)
            this.resyncBreakConsensus += 1;

        if (this.main != null)
            this.main.logger.log(this.main.myInfo.number + ": Network consensus is set to (negative/positive/resyncBreak): " +
                this.negativeConsensus + " / " + this.positiveConsensus + " / " + this.resyncBreakConsensus);
    }

    /**
     * Сhecks whether free registration is limited.
     *
     * @return {boolean} true if free registration is limited.
     */
    limitFreeRegistrations() {
        if (this.isFreeRegistrationsLimited === null)
            this.isFreeRegistrationsLimited = !(~VERSION.indexOf("private") || isFreeRegistrationsAllowedFromYaml);

        return this.isFreeRegistrationsLimited;
    }
}


///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Config};