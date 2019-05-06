const bs = require("biserializable");
const ex = require("exceptions");
const BiAdapter = require("biserializable").BiAdapter;
const TransactionPack = require("transactionpack").TransactionPack;

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
     * @return {Parcel} Parcel, it ready to send to the Universa.
     */
    constructor(payload, payment) {
        super();

        this.payload = payload;
        this.payment = payment;
        this.quantasLimit = 0;
        this.isTestPayment = false;

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

    }


}

DefaultBiMapper.registerAdapter(new BiAdapter("Parcel", Parcel));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Parcel};