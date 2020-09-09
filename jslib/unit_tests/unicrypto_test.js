import { SignedRecord, PublicKey, PrivateKey, randomBytes, hashId, crc32 } from 'unicrypto';
import { bytesToHex, hexToBytes } from 'unicrypto';
import { textToBytes, bytesToText } from 'unicrypto';
import { encode64, encode64Short, decode64 } from 'unicrypto';
import { encode58, decode58 } from 'unicrypto';

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



    // # Misc

    { // Random byte array for given length
        const bytes16 = randomBytes(16);
        console.log("randomBytes: " + new Uint8Array(bytes16.buffer));
    }

    { // HashId for binary data
        const id = await hashId(decode64("abc")); // Uint8Array
        console.log("hashId: " + encode64(id));
    }

    { // CRC32
        const digest = crc32(decode64("abc")); // Uint8Array
        console.log("CRC32: " + digest);
    }



    // # Converters

    { // Convert byte array to hex string and back
        const uint8arr = decode64("abc");
        console.log("uint8arr: " + uint8arr);
        const hexString = bytesToHex(uint8arr);  // String
        console.log("hexString: " + hexString);
        const bytesArray = hexToBytes(hexString); // Uint8Array
        console.log("bytesArray: " + bytesArray);
    }

    { // Convert plain text to bytes and back
        const bytes = textToBytes("one two three"); // Uint8Array
        console.log("bytes: " + bytes);
        const text = bytesToText(bytes); // "one two three"
        console.log("text: " + text);
    }

    { // Convert bytes to base64 and back
        const bytes = decode64("abc"); // Uint8Array
        console.log("bytes: " + bytes);
        const base64str = encode64(bytes); // String
        console.log("base64str: " + base64str);

        // short representation of base64 string
        const base64ShortString = encode64Short(bytes);
        console.log("base64ShortString: " + base64ShortString);
    }

    { // Convert bytes to base58 and back
        const bytes = decode58("abc"); // Uint8Array
        console.log("bytes: " + bytes);
        const base58str = encode58(bytes); // String
        console.log("base58str: " + base58str);
    }

});
