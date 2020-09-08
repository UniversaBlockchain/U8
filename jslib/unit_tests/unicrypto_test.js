import { SignedRecord, decode64, PublicKey, PrivateKey } from 'unicrypto';

unit.test("unicrypto examples", async () => {

    // some test data
    const privateKeyPacked = await (await PrivateKey.generate({strength: 2048})).pack();



    // # Signed record

    { // Pack data to signed record (Uint8Array) with key:

        const payload = {ab: "cd"};
        const nonce = decode64("abc");
        const key = await PrivateKey.unpack(privateKeyPacked);

        const recordBinary = await SignedRecord.packWithKey(key, payload, nonce);
        console.log(recordBinary.constructor.name); // Uint8Array
    }

    { // Unpack signed record:
        const payload = {ab: "cd"};
        const nonce = decode64("abc");
        const key = await PrivateKey.unpack(privateKeyPacked);

        const recordBinary = await SignedRecord.packWithKey(key, payload, nonce); // Uint8Array

        const record = await SignedRecord.unpack(recordBinary);

        console.log(record.recordType === SignedRecord.RECORD_WITH_KEY); // true
        console.log(record.nonce); // nonce
        console.log(record.payload); // payload
        console.log(record.key.shortAddress.base58); // PublicKey address
    }

});
