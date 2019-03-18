class Config {
    static quantiser_quantaPerU = 200;
    static maxExpirationDaysInTestMode = 365;
    static maxCostUInTestMode = 3;
    static validUntilTailTime = 5*60; //5 minutes
    static maxItemCreationAge = 5*24*3600; //5 days
}


///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Config};