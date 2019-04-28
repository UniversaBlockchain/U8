const BigDecimal  = require("big").Big;

class Config {
    static quantiser_quantaPerU = 200;
    static maxExpirationDaysInTestMode = 365;
    static maxCostUInTestMode = 3;
    static validUntilTailTime = 5*60; //5 minutes
    static maxItemCreationAge = 5*24*3600; //5 days

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
    static uIssuerKeys = new Set([
        new crypto.KeyAddress("ZNuBikFEZbw71QQAFkNQtjfkmxFAdMgveTVPMGrFwo9vQwwPVE"),
        new crypto.KeyAddress("J3uaVvHE7JqhvVb1c26RyDhfJw9eP2KR1KRhm2VdmYx7NwHpzdHTyEPjcmKpgkJAtzWLSPUw")
    ]);
    static authorizedNameServiceCenterKey = new crypto.PublicKey(atob("HggcAQABxAABg9ideX6A3Wk9CuwnZrakXdvhYDiIiO0HA+YWmLArcZvhhaGMrw1i1mA6S9L6NPAuhYcZzm8Mxtwr1RESyJqm+HFwU+49s0yXHhCJsXcvK23Yx7NEpIrpGkKt9OCCdBGhQkls0Yc1lBBmGYCrShMntPC9xY9DJZ4sbMuBPIUQzpnWLYgRAbZb+KuZFXAIr7hRO0rNTZ6hE5zp6oPwlQLh9hBy6CsvZD/73Cf2WtKDunHD1qKuQU/KqruqVMMv2fd6ZKo692esWsqqIAiQztg1+sArAhf0Cr8lhRf53G5rndiiQx7RDs1P9Pp1wWK9e93UL1KF4PpVx7e7SznrCHTEdw"));

    static uTemplatePath = "../test/UTemplate.yml";                         //
    static testUTemplatePath = "../test/TestUTemplate.yml";                 // TODO It is temporary
    static uKeyPath = "..test/keys/u_key.private.unikey";                   //
}


///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Config};