function Config() {
}

Config.quantiser_quantaPerU = 200;
Config.maxExpirationDaysInTestMode = 365;
Config.maxCostUInTestMode = 3;
Config.validUntilTailTime = 5*60; //5 minutes
Config.maxItemCreationAge = 5*24*3600; //5 days

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Config};