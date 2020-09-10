import { SignedRecord, PublicKey, PrivateKey, randomBytes, hashId, crc32 } from 'unicrypto';
import { bytesToHex, hexToBytes } from 'unicrypto';
import { textToBytes, bytesToText } from 'unicrypto';
import { encode64, encode64Short, decode64 } from 'unicrypto';
import { encode58, decode58 } from 'unicrypto';
import { SHA, HMAC } from 'unicrypto';

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



    // # SHA, Supports SHA256, SHA512, SHA1, SHA3(256, 384, 512)

    { // Get instant hash value for given byte array
        const resultBytes1 = await SHA.getDigest('sha256', textToBytes('somevalue')); // Uint8Array
        console.log("resultBytes1: " + resultBytes1);
    }

    { // Get hash value for large data
        const sha512 = new SHA(512);
        const dataPart1 = textToBytes('dataPart1');
        const dataPart2 = textToBytes('dataPart2');
        const dataPartFinal = textToBytes('dataPartFinal');

        await sha512.put(dataPart1); // dataPart1 is Uint8Array
        await sha512.put(dataPart2);
        // .....
        await sha512.put(dataPartFinal);

        const resultBytes = await sha512.get(); // Uint8Array
        console.log("resultBytes: " + resultBytes);
        console.log("resultBytes size: " + sha512.getDigestSize());
    }

    { // Get hash value in HEX
        const sha256 = new SHA(256);
        const hexResult = await sha256.get(textToBytes("one two three"), 'hex'); // String
        console.log("hexResult: " + hexResult);
    }



    // # HMAC
    {
        const data = textToBytes('a quick brown for his done something disgusting');
        const key = textToBytes('1234567890abcdef1234567890abcdef');

        const hmac = new HMAC('sha256', key);
        const result = await hmac.get(data); // Uint8Array
        console.log("hmac result: " + result);
    }

});
