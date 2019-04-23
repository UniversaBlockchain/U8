const NSmartContract = require("services/NSmartContract").NSmartContract;

const REFERENCE_CONDITION_PREFIX = "ref.state.origin==";
const REFERENCE_CONDITION_LEFT = "ref.state.origin";
const REFERENCE_CONDITION_OPERATOR = 7;       // EQUAL

class UnsContract extends NSmartContract {

    static NAMES_FIELD_NAME = "names";
    static ENTRIES_FIELD_NAME = "entries";
    static PREPAID_ND_FIELD_NAME = "prepaid_ND";
    static PREPAID_ND_FROM_TIME_FIELD_NAME = "prepaid_ND_from";
    static STORED_ENTRIES_FIELD_NAME = "stored_entries";
    static SPENT_ND_FIELD_NAME = "spent_ND";
    static SPENT_ND_TIME_FIELD_NAME = "spent_ND_time";


}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsContract", UnsContract));

module.exports = {UnsContract};