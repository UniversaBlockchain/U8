import { SignedRecord, PublicKey, PrivateKey, AbstractKey, SymmetricKey } from 'unicrypto';
import { BigInteger, randomBytes, hashId, crc32 } from 'unicrypto';
import { bytesToHex, hexToBytes } from 'unicrypto';
import { textToBytes, bytesToText } from 'unicrypto';
import { encode64, encode64Short, decode64 } from 'unicrypto';
import { encode58, decode58 } from 'unicrypto';
import { SHA, HMAC } from 'unicrypto';
import { pbkdf2 } from 'unicrypto';

unit.test("unicrypto examples", async () => {

    // some test data
    const privateKeyPacked = decode64("JgAcAQABvID1lpufFoyMlR5FYtVgzbVnSGk50h6sHpIXTYMMqlu54dQ5eD+qH2s2WNAajXmj9bjFW6CCBFzQAY3tY/9m8peSncNBjBLw/goXbEij3fCf0SqQllf9PSXBZAYwATqzdhrE8zRlMCZFXe6tspmATn/s9YME/A5CFCRz81l1tgOqw7yA5eOoQmB9kJTcLvzGKFSNjcVY7lwjkx8ND8Da/0AczIsiDCVvmYjgZVU9N1uxMMbR+D+NCGgHThpbDXIW0TSGNz8Xg0uA3B999bzGhRDeoUxs7sBqzb+ZgluGsIf8GSwpkhaX+7JiBPzHKjuTSDC86JSXzvllW2/BR+JlSUlvtPk=");


    // // todo: must not to crash
    // for (let i = 0; i < 1000; ++i) {
    //     const publicKey = (await PrivateKey.generate({strength: 2048})).publicKey;
    //
    //     console.log("i = " + i);
    //     console.log(PublicKey.isValidAddress(publicKey.shortAddress));
    //     console.log(PublicKey.isValidAddress(publicKey.shortAddress58));
    // }





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



    // # PBKDF2
    {
        const derivedKey = await pbkdf2('sha256', {
            rounds: 1, // number of iterations
            keyLength: 20,  // bytes length
            password: 'password',
            salt: hexToBytes('abc123')
        }); // Uint8Array
        console.log("derivedKey: " + derivedKey);
    }



    // # RSA Pair, keys helpers

    { // Private key unpack
        const pk = await PrivateKey.generate({strength: 2048});
        console.log("key generated: " + pk.publicKey.shortAddress.base58);
        const keyPacked64 = encode64(await pk.pack());
        const keyPacked64pswd = encode64(await pk.pack("qwerty"));
        const bossEncodedKey = decode64(keyPacked64);
        const bossEncodedKeyPswd = decode64(keyPacked64pswd);

        const privateKey2 = await PrivateKey.unpack(bossEncodedKey);
        console.log("key unpack: " + privateKey2.publicKey.shortAddress.base58);

        // Read password-protected key
        const privateKey4 = await PrivateKey.unpack({
            bin: bossEncodedKeyPswd,
            password: "qwerty"
        });
        console.log("key unpack password-protected: " + privateKey4.publicKey.shortAddress.base58);
    }

    { // Public key unpack
        const pk = await PrivateKey.generate({strength: 2048});
        console.log("key generated: " + pk.publicKey.shortAddress.base58);
        const keyPacked64 = encode64(await pk.pack());

        const bossEncodedKey = decode64(keyPacked64);
        const privateKey1 = await PrivateKey.unpack(bossEncodedKey);
        const publicKey1 = privateKey1.publicKey;
        console.log("publicKey1: " + publicKey1.shortAddress.base58);

        const bossEncodedPublicKey = await publicKey1.pack();
        const publicKey2 = await PublicKey.unpack(bossEncodedPublicKey);
        console.log("publicKey2: " + publicKey2.shortAddress.base58);
    }

    { // Public key fingerprint
        const publicKey = (await PrivateKey.generate({strength: 2048})).publicKey;
        console.log("publicKey.fingerprint: " + publicKey.fingerprint); // fingerprint (Uint8Array)
    }

    { // Public key bit strength
        const publicKey = (await PrivateKey.generate({strength: 2048})).publicKey;
        console.log("publicKey.getBitStrength: " + publicKey.getBitStrength()); // number
    }

    { // Public key address
        const publicKey = (await PrivateKey.generate({strength: 2048})).publicKey;

        console.log("publicKey.shortAddress.bytes: " + publicKey.shortAddress.bytes);   // short address (Uint8Array)
        console.log("publicKey.shortAddress.base58: " + publicKey.shortAddress.base58);   // short address (Uint8Array)
        console.log("publicKey.longAddress.bytes: " + publicKey.longAddress.bytes);    // long address (Uint8Array)
        console.log("publicKey.longAddress.base58: " + publicKey.longAddress.base58);    // long address (Uint8Array)

        // DEPRECATED
        console.log("publicKey.shortAddress58: " + publicKey.shortAddress58); // short address (base58)
        console.log("publicKey.longAddress58: " + publicKey.longAddress58);  // long address (base58)
    }

    { // Check if given address is valid
        const publicKey = (await PrivateKey.generate({strength: 2048})).publicKey;

        // todo: must returns true
        console.log(PublicKey.isValidAddress(publicKey.shortAddress)); // true

        // accepts base58 representation of address too
        console.log(PublicKey.isValidAddress(publicKey.shortAddress58)); // true
    }

    { // Generate private key
        const options = { strength: 2048 };
        const priv = await PrivateKey.generate(options); // instance of PrivateKey
        console.log("priv key generated: " + priv.publicKey.shortAddress.base58);
    }

    { // Private(public) key - export
        const pk = await PrivateKey.generate({strength: 2048});
        const keyPacked64 = encode64(await pk.pack());
        const bossEncodedKey = decode64(keyPacked64);

        const key = await PrivateKey.unpack(bossEncodedKey);
        const keyPacked = await key.pack(); // Uint8Array
        console.log("keyPacked: " + keyPacked);
        const keyPackedProtected = await key.pack("somepassword"); // Uint8Array
        console.log("keyPackedProtected: " + keyPackedProtected);
        const keyPackedProtected1000 = await key.pack({ password: "qwerty", rounds: 1000 });
        console.log("keyPackedProtected1000: " + keyPackedProtected1000);

        const bossEncodedPublic = key.publicKey.packed;
        console.log("bossEncodedPublic: " + bossEncodedPublic);
    }

    { // Get type of key package
        const privateKey = await PrivateKey.generate({strength: 2048});

        const bossEncoded = await privateKey.pack("somepassword");

        console.log("check type of key package: " + (AbstractKey.typeOf(bossEncoded) === AbstractKey.TYPE_PRIVATE_PASSWORD_V2)); // true
    }



    // # KEY INFO
    // todo: .......
    // .......
    // .......
    // .......



    // # SYMMETRIC KEY

    { // main interface to the symmetric cipher
        // Creates random key (AES256, CTR)
        const symmetricKey = new SymmetricKey();
        console.log("random symmetricKey: " + encode64(symmetricKey.pack()));

        // Creates key by derived key (Uint8Array) and it's info (KeyInfo)
        const symmetricKey2 = new SymmetricKey({
            keyBytes: symmetricKey.pack(),
            keyInfo: symmetricKey.keyInfo
        });
        console.log("symmetricKey2: " + encode64(symmetricKey2.pack()));

        // Creates key by derived key (Uint8Array)
        const symmetricKey3 = new SymmetricKey({
            keyBytes: symmetricKey.pack()
        });
        console.log("symmetricKey3: " + encode64(symmetricKey3.pack()));

        // // todo: must not to crash
        // // Creates key by password (String) and number of rounds (Int). Salt is optional
        // // Uint8Array, null by default
        // const symmetricKey4 = await SymmetricKey.fromPassword("some_password", 1000, decode64('abc'));
        // console.log("symmetricKey4: " + encode64(symmetricKey4.pack()));
    }

    { // Pack symmetric key (get derived key bytes)
        // Creates random key (AES256, CTR)
        const symmetricKey = new SymmetricKey();

        const derivedKey = symmetricKey.pack(); // Uint8Array
        console.log("derivedKey: " + encode64(derivedKey));
    }

    { // Encrypt / decrypt data with AES256 in CRT mode with IV
        const data = textToBytes("test_string");
        const symmetricKey = new SymmetricKey();
        // data is Uint8Array
        const encrypted = symmetricKey.encrypt(data); // Uint8Array
        console.log("encrypted: " + encode64(encrypted));
        const decrypted = symmetricKey.decrypt(encrypted); // Uint8Array
        console.log("decrypted: " + bytesToText(decrypted));
    }

    { // Encrypt / decrypt data with EtA using Sha256-based HMAC
        const data = textToBytes("test_string");
        const symmetricKey = new SymmetricKey();
        // data is Uint8Array
        const encrypted = await symmetricKey.etaEncrypt(data); // Uint8Array
        console.log("eta encrypted: " + encode64(encrypted));
        const decrypted = await symmetricKey.etaDecrypt(encrypted); // Uint8Array
        console.log("eta decrypted: " + bytesToText(decrypted));
    }



    // # RSA OAEP/PSS

    { // OAEP encrypt/decrypt
        const privateKey = await PrivateKey.unpack(privateKeyPacked);
        const publicKey = privateKey.publicKey;

        // encrypt data
        const data = decode64("abc123");
        const options = {
            seed: decode64("abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcab="), // optional, default none
            mgf1Hash: 'sha512', // optional, default SHA(256)
            oaepHash: 'sha512' // optional, default SHA(256)
        };
        const encrypted = await publicKey.encrypt(data, options);
        console.log("encrypted: " + encode64(encrypted));
        const decrypted = await privateKey.decrypt(encrypted, options);

        console.log("check OAEP encrypt/decrypt: " + (encode64(data) === encode64(decrypted))); // true
    }

    { // OAEP max encryption message length
        const privateKey = await PrivateKey.unpack(privateKeyPacked);
        const publicKey = privateKey.publicKey;

        // encrypt data
        const options = {
            mgf1Hash: 'SHA512', // optional, default SHA(256)
            oaepHash: 'SHA512' // optional, default SHA(256)
        };

        const maxLength = publicKey.encryptionMaxLength(options);
        console.log("encryptionMaxLength: " + publicKey.encryptionMaxLength(options));
    }

    { // OAEP default hash
        const privateKey = await PrivateKey.unpack(privateKeyPacked);
        const publicKey = privateKey.publicKey;
        // todo: must not be undefined
        console.log("publicKey.DEFAULT_OAEP_HASH: " + PublicKey.DEFAULT_OAEP_HASH); // SHA1 instance
    }

    { // MGF1 default hash
        const privateKey = await PrivateKey.unpack(privateKeyPacked);
        const publicKey = privateKey.publicKey;
        // todo: must not be undefined
        console.log("publicKey.DEFAULT_OAEP_HASH: " + PublicKey.DEFAULT_MGF1_HASH); // SHA1 instance
    }

    { // PSS sign/verify
        const privateKey = await PrivateKey.unpack(privateKeyPacked);
        const publicKey = privateKey.publicKey;

        const options = {
            // // todo: "salt is not defined" error
            // salt: decode64("abcabc"), // optional
            // saltLength: null, // optional, numeric
            mgf1Hash: 'sha512', // optional, default SHA(256)
            pssHash: 'sha512' // optional, default SHA(256)
        };

        const message = 'abc123';

        const signature = await privateKey.sign(message, options);
        const isCorrect = await publicKey.verify(message, signature, options);
        console.log("PSS sign/verify: " + isCorrect); // true
    }

});
