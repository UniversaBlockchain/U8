const bs = require("biserializable");
const ex = require("exceptions");
const Boss = require('boss.js');
const BiAdapter = require("biserializable").BiAdapter;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const TransactionPack = require("transactionpack").TransactionPack;
const Quantiser = require("quantiser").Quantiser;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;

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

    serialize(serializer) {
        return {
            "payload": this.payload.pack(),
            "payment": this.payment.pack(),
            "hashId": serializer.serialize(this.hashId)
        };
    }

    deserialize(data, deserializer) {
        this.payload = TransactionPack.unpack(data.payload);
        this.payment = TransactionPack.unpack(data.payment);
        this.hashId = deserializer.deserialize(data.hashId);

        this.prepareForNode();
    }

    /**
     * Shortcut to {@link Boss#dump(Object)} for this.
     *
     * @return {Uint8Array} a packed binary
     */
    pack() {
        if (this.packedBinary == null)
            this.packedBinary = Boss.dump(BossBiMapper.getInstance().serialize(this));
        return this.packedBinary;
    }

    /**
     * Unpack parcel.
     *
     * @param {Uint8Array} pack - Is binary that was packed by {@link Parcel#pack()}.
     * @return {Parcel} unpacked parcel.
     */
    static unpack(pack) {

        let x = BossBiMapper.getInstance().deserialize(Boss.load(pack));

        if (x instanceof Parcel) {
            x.packedBinary = pack;
            return x;
        }

        return null;
    }
}

DefaultBiMapper.registerAdapter(new BiAdapter("Parcel", Parcel));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Parcel};