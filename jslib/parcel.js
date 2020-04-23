/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const ex = require("exceptions");
const Boss = require('boss.js');
const BiAdapter = require("biserializable").BiAdapter;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const TransactionPack = require("transactionpack").TransactionPack;
const Quantiser = require("quantiser").Quantiser;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const QuantiserException = require("quantiser").QuantiserException;

class BadPayloadException extends ex.IllegalArgumentError {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class BadPaymentException extends ex.IllegalArgumentError {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class OwnerNotResolvedException extends BadPaymentException {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class InsufficientFundsException extends BadPaymentException {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class Parcel extends bs.BiSerializable {

    /**
     * This class implements Parcel.
     *
     * Parcel: the payment transaction and the payload transaction packed together.
     * The unit of data that node expects from the client to perform approval.
     *
     * Payload: the client's transaction he or she needs to approve with the Universa.
     *
     * Payment: the client's transaction that spends one or more U to pay for the payload processing.
     *
     * Cost: payload processing cost in U, positive integer.
     * Transaction in U contracts owned by the client reducing its remaining value by some value, or this value.
     *
     * Parcel sends via network as packed {@link Parcel#pack()} byte array. When the node get byte array it
     * unpack it via {@link Parcel#unpack(byte[])}, while unpacking payment and payload is unpacking
     * as {@link TransactionPack}, then {@link Parcel#prepareForNode()} is called and unpacked contracts is preparing
     * for the node (set need flags and quanta's limits).
     *
     * @param {TransactionPack} payload - Payload transaction pack.
     * @param {TransactionPack} payment - Payment transaction pack.
     */
    constructor(payload, payment) {
        super();

        this.quantasLimit = 0;
        this.isTestPayment = false;

        if (payload == null || payment == null)
            return;

        this.payload = payload;
        this.payment = payment;

        let digests = new Uint8Array(payment.contract.id.digest.length + payload.contract.id.digest.length);
        digests.set(payment.contract.id.digest);
        digests.set(payload.contract.id.digest, payment.contract.id.digest.length);

        this.hashId = crypto.HashId.of(digests);

        this.prepareForNode();
    }

    /**
     * Method check parcel's specific behavior and prepare Parcel for the node. It do while unpacking on the Node.
     * First of all, method extract set payment in U amount convert it to quantas and set quantas for payload.
     * Method check if payment is test and set special flag in the payment and payload contracts.
     * And finally set special flag for payment that contract should be U and node should check it in special mode.
     */
    prepareForNode() {
        // general idea - take U from payment's parent and take U from payment itself and calculate
        // difference - it will be payment amount in U.

        // then check test or real payment by field names.
        let parent = null;
        for (let c of this.payment.contract.revokingItems)
            if (this.payment.contract.state.parent != null && c.id.equals(this.payment.contract.state.parent)) {
                parent = c;
                break;
            }

        if (parent != null) {
            // set pay quantasLimit for payload processing
            if (this.payment.contract.state.data.test_transaction_units != null) {
                this.isTestPayment = true;
                this.quantasLimit = Quantiser.quantaPerU * (
                    parent.state.data.test_transaction_units - this.payment.contract.state.data.test_transaction_units
                );
            }

            if (this.quantasLimit <= 0) {
                this.isTestPayment = false;
                this.quantasLimit = Quantiser.quantaPerU * (
                    parent.state.data.transaction_units - this.payment.contract.state.data.transaction_units
                );
            }
        }

        this.payment.contract.shouldBeU = true;
        this.payment.contract.limitedForTestnet = this.isTestPayment;
        this.payload.contract.limitedForTestnet = this.isTestPayment;
        this.payload.contract.newItems.forEach(c => c.limitedForTestnet = this.isTestPayment);
    }

    getPayloadContract() {
        if (this.payload != null)
            return this.payload.contract;
        return null;
    }

    getPaymentContract() {
        if (this.payment != null)
            return this.payment.contract;
        return null;
    }

    async serialize(serializer) {
        return {
            "payload": await this.payload.pack(),
            "payment": await this.payment.pack(),
            "hashId": await serializer.serialize(this.hashId)
        };
    }

    async deserialize(data, deserializer) {
        this.payload = await TransactionPack.unpack(data.payload);
        this.payment = await TransactionPack.unpack(data.payment);
        this.hashId = await deserializer.deserialize(data.hashId);

        this.prepareForNode();
    }

    /**
     * Shortcut to {@link Boss#dump(Object)} for this.
     *
     * @return {Uint8Array} a packed binary
     */
    async pack() {
        if (this.packedBinary == null)
            this.packedBinary = await Boss.dump(await BossBiMapper.getInstance().serialize(this));
        return this.packedBinary;
    }

    /**
     * Unpack parcel.
     *
     * @param {Uint8Array} pack - Is binary that was packed by {@link Parcel#pack()}.
     * @return {Parcel} unpacked parcel.
     */
    static async unpack(pack) {

        let x = await BossBiMapper.getInstance().deserialize(await Boss.load(pack));

        if (x instanceof Parcel) {
            x.packedBinary = pack;
            return x;
        }

        return null;
    }

    /**
     * Create parcel used for paid contract registration on the network.
     * An additional payment of specified amount is added to the payload contract.
     * This payment is used by various types of {@see NSmartContract}.
     *
     * Note: this method uses new way of providing additional payments to {@see NSmartContract}
     * currently it is only supported by {@see UnsContract}.
     *
     * @param {Contract | UnsContract} payload - Contract to be registered on the network.
     * @param {Contract} uContract - Contract containing units used for payment.
     * @param {Iterable<crypto.PrivateKey>} uKeys - Keys to resolve owner of payment contract.
     * @param {number} payingAmount - paying amount for payload contract.
     * @return {Parcel} parcel to be registered.
     */

    static async of(payload, uContract, uKeys, payingAmount) {
        let p = await Parcel.createParcel(payload, uContract, uKeys, false);
        if (payingAmount > 0)
            await p.addPayingAmountV2(payingAmount, uKeys);
        return p;
    }

    /**
     * Create parcel used for paid contract registration on the network.
     *
     * @param {Contract} payload - Contract to be registered on the network.
     * @param {Contract} uContract - Contract containing units used for payment.
     * @param {Iterable<crypto.PrivateKey>} uKeys - Keys to resolve owner of payment contract.
     * @param {boolean} withTestPayment - Flag indicates if test units should be used and contract should be registered
     * on the TestNet rather than MainNet.
     * @return {Parcel} parcel to be registered
     */
    static async createParcel(payload, uContract, uKeys, withTestPayment) {
        let checkResult = true;
        try {
            payload.quantiser.resetNoLimit();
            checkResult = await payload.check();

        } catch (quantiserIgnored) {
            if (!(quantiserIgnored instanceof QuantiserException))
                throw quantiserIgnored;
        }

        if (!checkResult)
            throw new BadPayloadException("payload contains errors: " + JSON.stringify(payload.errors));

        let costU = payload.getProcessedCostU();
        let payment = Parcel.createPayment(uContract, uKeys, costU, withTestPayment);

        return new Parcel(payload.transactionPack, payment.transactionPack);
    }

    static async createPayment(uContract, uKeys, amount, withTestPayment) {
        let payment = await uContract.createRevision(uKeys);
        let fieldName = withTestPayment ? "test_transaction_units" : "transaction_units";
        payment.state.data[fieldName] = uContract.state.data[fieldName] - amount;
        await payment.seal();
        try {
            payment.quantiser.resetNoLimit();
            if (! (await payment.check())) {
                if (!payment.roles.owner.isAllowedForKeys(new Set(uKeys)))
                    throw new OwnerNotResolvedException("Unable to create payment: Check that provided keys are enough to resolve U-contract owner.");
                else if (payment.state.data[fieldName] < 0)
                    throw new InsufficientFundsException("Unable to create payment: Check provided U-contract to have at least " +
                        amount + (withTestPayment ? " test":"") + " units available.");
                else
                    throw new BadPaymentException("Unable to create payment: " + JSON.stringify(payment.errors));
            }
        } catch (quantiserIgnored) {
            if (!(quantiserIgnored instanceof QuantiserException))
                throw quantiserIgnored;
        }

        return payment;
    }

    /**
     * Adds an additional paying amount to the main contract of the parcel.
     *
     * Main payment contract of a parcel is used for an additional payment so it must contain required amount of units.
     * An additional payment is used by various types of {@see NSmartContract}.
     *
     * Note: this method uses new way of providing additional payments to {@see NSmartContract}
     * currently it is only supported by {@see UnsContract}.
     *
     * @param {number} payingAmount - Amount paid additionally.
     * @param {Iterable<crypto.PrivateKey>}uKeys - Keys to resolve owner of parcel main payment contract.
     */

    async addPayingAmountV2(payingAmount, uKeys) {
        let transactionPayment = this.payment.contract;
        if (!transactionPayment.equals(this.getRemainingU()))
            throw new ex.IllegalArgumentError("The paying amount has been added already");

        let payment = await Parcel.createPayment(transactionPayment, uKeys, payingAmount, false);
        // we add new item to the contract, so we need to recreate transaction pack
        let mainContract = this.payload.contract;
        // Compound compound = new Compound();
        // compound.addContract(COMPOUND_MAIN_TAG,mainContract,null);
        // compound.addContract(COMPOUND_PAYMENT_TAG,payment,null);
        // TransactionPack tp = compound.getCompoundContract().getTransactionPack();
        // tp.addTag(TP_PAYING_FOR_TAG_PREFIX + mainContract.getId().toBase64String(),payment.getId());
        // this.payload = tp;
    }

    /**
     * Gets the latest revision of payment contract used by this Parcel.
     * This revision will have {@code APPROVED} status
     * and must be kept and used for future transactions
     *
     * @param {boolean} payloadApproved - Is payload APPROVED
     * @return {Contract} contract containing remaining U
     */
    getRemainingU(payloadApproved = true) {
        // AtomicReference<Contract> u = new AtomicReference<>(getPaymentContract());
        // while (payloadApproved) {
        //     Optional<Contract> result = getPayload().getSubItems().values().stream().filter(si -> si.getParent() != null && si.getParent().equals(u.get().getId())).findAny();
        //     if (result.isPresent()) {
        //         u.set(result.get());
        //     } else {
        //         break;
        //     }
        // }
        //
        // return u.get();
    }
}

DefaultBiMapper.registerAdapter(new BiAdapter("Parcel", Parcel));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Parcel, BadPayloadException, BadPaymentException, OwnerNotResolvedException, InsufficientFundsException};