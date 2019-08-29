/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ItemState = {
    /**
     * Bad state, can't process. For example, structure that is not yet initialized. Otherwise, the contract us unknown
     * to the system, which could be used in the client API calls, to check the state of the existing contract.
     */
    UNDEFINED: {val:"UNDEFINED", isPending: false, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:0},
    /**
     * The contract is being processed. No positive or negative local solution is yet found. For example, the contract
     * is being downloaded or being checked locally. This state requires calling party to repeat the inquiry later.
     */
    PENDING:{val:"PENDING", isPending: true, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:1},
    /**
     * The contract is locally checked and found OK against local ledger, voting is in progress and no consensus is
     * found.
     */
    PENDING_POSITIVE:{val:"PENDING_POSITIVE", isPending: true, isPositive: true, isApproved: false, isConsensusFound: false, ordinal:2},
    /**
     * The contract is locally checked and found bad, but voting is yet in progress and yet no consensus is found.
     */
    PENDING_NEGATIVE:{val:"PENDING_NEGATIVE", isPending: true, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:3},
    /**
     * The positive consensus is found for the contract, it was approved by the network and is not yet revoked.
     */
    APPROVED:{val:"APPROVED", isPending: false, isPositive: true, isApproved: true, isConsensusFound: true, ordinal:4},
    /**
     * The item is locked for revocation by some transaction
     */
    LOCKED:{val:"LOCKED", isPending: false, isPositive: true, isApproved: true, isConsensusFound: true, ordinal:5},
    /**
     * The contract once approved by the network is now revoked and is being kept in archive for appropriate time.
     * Archived signatures are kept only the time needed to prevent some sort of attacks and process with any support
     * requests. It could be, for example, 90 days.
     */
    REVOKED : {val:"REVOKED", isPending: false, isPositive: false, isApproved: false, isConsensusFound: true, ordinal:6},
    /**
     * The contract was checked by the network and negative consensus was found. Declined signatures are kept, like
     * REVOKED contracts, a limited time and with for the same reasons.
     */
    DECLINED : {val:"DECLINED", isPending: false, isPositive: false, isApproved: false, isConsensusFound: true, ordinal:7},
    /**
     * the item must be discarded without further processing
     */
    DISCARDED : {val:"DISCARDED", isPending: false, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:8},
    /**
     * Special state: locked by another mending item that will create and approve this item if approved by the
     * consensus. This state is separated from others to detect attempt to create same item by different racing items
     * being voted, so only one os them will succeed, as only one of them will succeed to lock for creation its output
     * documents.
     */
    LOCKED_FOR_CREATION : {val:"LOCKED_FOR_CREATION", isPending: false, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:9},

    /**
     * Special state: LOCKED_FOR_CREATION item being revoke within the same transaction. This state differs from LOCKED
     * as the it transfers into UNDEFINED rather than APPROVED in case of transaction rollback.
     */
    LOCKED_FOR_CREATION_REVOKED : {val:"LOCKED_FOR_CREATION_REVOKED", isPending: false, isPositive: false, isApproved: false, isConsensusFound: false, ordinal:10}
};

ItemState.byVal = new Map();
ItemState.byVal.set(ItemState.UNDEFINED.val,ItemState.UNDEFINED);
ItemState.byVal.set(ItemState.PENDING.val,ItemState.PENDING);
ItemState.byVal.set(ItemState.PENDING_POSITIVE.val,ItemState.PENDING_POSITIVE);
ItemState.byVal.set(ItemState.PENDING_NEGATIVE.val,ItemState.PENDING_NEGATIVE);
ItemState.byVal.set(ItemState.APPROVED.val,ItemState.APPROVED);
ItemState.byVal.set(ItemState.LOCKED.val,ItemState.LOCKED);
ItemState.byVal.set(ItemState.REVOKED.val,ItemState.REVOKED);
ItemState.byVal.set(ItemState.DECLINED.val,ItemState.DECLINED);
ItemState.byVal.set(ItemState.DISCARDED.val,ItemState.DISCARDED);
ItemState.byVal.set(ItemState.LOCKED_FOR_CREATION.val,ItemState.LOCKED_FOR_CREATION);
ItemState.byVal.set(ItemState.LOCKED_FOR_CREATION_REVOKED.val,ItemState.LOCKED_FOR_CREATION_REVOKED);


ItemState.byOrdinal = new Map();
ItemState.byOrdinal.set(ItemState.UNDEFINED.ordinal,ItemState.UNDEFINED);
ItemState.byOrdinal.set(ItemState.PENDING.ordinal,ItemState.PENDING);
ItemState.byOrdinal.set(ItemState.PENDING_POSITIVE.ordinal,ItemState.PENDING_POSITIVE);
ItemState.byOrdinal.set(ItemState.PENDING_NEGATIVE.ordinal,ItemState.PENDING_NEGATIVE);
ItemState.byOrdinal.set(ItemState.APPROVED.ordinal,ItemState.APPROVED);
ItemState.byOrdinal.set(ItemState.LOCKED.ordinal,ItemState.LOCKED);
ItemState.byOrdinal.set(ItemState.REVOKED.ordinal,ItemState.REVOKED);
ItemState.byOrdinal.set(ItemState.DECLINED.ordinal,ItemState.DECLINED);
ItemState.byOrdinal.set(ItemState.DISCARDED.ordinal,ItemState.DISCARDED);
ItemState.byOrdinal.set(ItemState.LOCKED_FOR_CREATION.ordinal,ItemState.LOCKED_FOR_CREATION);
ItemState.byOrdinal.set(ItemState.LOCKED_FOR_CREATION_REVOKED.ordinal,ItemState.LOCKED_FOR_CREATION_REVOKED);


module.exports = {ItemState};