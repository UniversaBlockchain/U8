import { SignedRecord, decode64, PublicKey, PrivateKey } from 'unicrypto';

unit.test("unicrypto example: signed record", async () => {
    const privateKeyPacked = await (await PrivateKey.generate({strength: 2048})).pack();

    const payload = { ab: "cd" };
    const nonce = decode64("abc");
    const key = await PrivateKey.unpack(privateKeyPacked);

    //console.log(key.publicKey.shortAddress.bytes);
    console.log(key.publicKey.shortAddress.base58);
    //console.log(key.publicKey.longAddress.bytes);
    console.log(key.publicKey.longAddress.base58);
    console.log(key.publicKey.fingerprint);

    const recordBinary = await SignedRecord.packWithKey(key, payload, nonce);
    console.log(recordBinary.constructor.name); // Uint8Array
});
