const Errors  = {
        NOT_SUPPORTED:"NOT_SUPPORTED",
        BAD_VALUE:"BAD_VALUE",
        EXPIRED:"EXPIRED",
        MISSING_OWNER:"MISSING_OWNER",
        MISSING_ISSUER:"MISSING_ISSUER",
        MISSING_CREATOR:"MISSING_CREATOR",
        ISSUER_MUST_CREATE:"ISSUER_MUST_CREATE",
        NOT_SIGNED:"NOT_SIGNED",
        /**
         * Issuer/creator has no right to perform requested change, revocation, etc.
         */
        FORBIDDEN:"FORBIDDEN",
        /**
         * Too many errors, the check could not be done at full.
         */
        FAILED_CHECK:"FAILED_CHECK",
        /**
         * Approvable item of unknown type or general reference error
         */
        BAD_REF:"BAD_REF",
        BAD_SIGNATURE:"BAD_SIGNATURE",
        /**
         * can't revoke requested item
         */
        BAD_REVOKE:"BAD_REVOKE",
        BAD_NEW_ITEM:"BAD_NEW_ITEM",
        NEW_ITEM_EXISTS:"NEW_ITEM_EXISTS",
        ILLEGAL_CHANGE:"ILLEGAL_CHANGE",
        /**
         * New state is bad in general (say, not changed)
         */
        BADSTATE:"BADSTATE"
        // -------------------------- other errors which are not contract-specific
        ,    /**
     * General error of unknown type
     */
        FAILURE:"FAILURE",
        BAD_CLIENT_KEY:"BAD_CLIENT_KEY",
        UNKNOWN_COMMAND:"UNKNOWN_COMMAND",
        NOT_READY:"NOT_READY",
        NOT_FOUND:"NOT_FOUND",
        COMMAND_FAILED:"COMMAND_FAILED",
        COMMAND_PENDING:"COMMAND_PENDING"
};

module.exports = {Errors};