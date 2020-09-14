/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "KeyInfo.h"
#include "../types/UBytes.h"
#include "../serialization/BossSerializer.h"
#include "cryptoCommon.h"
#include "PBKDF2.h"

using namespace crypto;

KeyInfo::PRF KeyInfo::PRFFromName(const std::string& name) {
    if (name == "HMAC_SHA256")
        return KeyInfo::PRF::HMAC_SHA256;
    else if (name == "HMAC_SHA512")
        return KeyInfo::PRF::HMAC_SHA512;
    else if (name == "HMAC_SHA1")
        return KeyInfo::PRF::HMAC_SHA1;
    else if (name == "None")
        return KeyInfo::PRF::None;
    throw std::invalid_argument("KeyInfo::PRFFromName error: unknown name '"+name+"'");
}

KeyInfo::KeyInfo(const byte_vector& packedBinary) {
    auto bv = packedBinary;
    UBytes uBytes(std::move(bv));
    BossSerializer::Reader reader(uBytes);
    algorythm = (Algorythm)UInt::asInstance(reader.readObject()).get();
    auto uobj = reader.readObject();
    if (uobj.isNull())
        tag = nullptr;
    else
        tag = std::make_shared<byte_vector>(UBytes::asInstance(uobj).get());
    prf = (PRF)UInt::asInstance(reader.readObject()).get();
    keyLength = (int)UInt::asInstance(reader.readObject()).get();
    if (isPassword()) {
        if (UInt::asInstance(reader.readObject()).get() != 0)
            throw std::invalid_argument("unknown PBKDF type");
        rounds = (int)UInt::asInstance(reader.readObject()).get();
    }
    try {
        salt = std::make_shared<byte_vector>(UBytes::asInstance(reader.readObject()).get());
    } catch (...) {
        salt = nullptr;
    }

    checkSanity();
}

KeyInfo::KeyInfo(KeyInfo::PRF prf, int rounds, const byte_vector& salt, std::shared_ptr<byte_vector> tag) {
    this->algorythm = Algorythm::AES256;
    this->tag = tag;
    this->prf = prf;
    this->rounds = rounds;
    this->salt = std::make_shared<byte_vector>(salt);
    checkSanity();
}

void KeyInfo::checkSanity() {
    switch (algorythm) {
        case Algorythm::RSAPrivate:
        case Algorythm::RSAPublic: {
            if (isPassword())
                throw std::invalid_argument("RSA keys can't be password-derived");
            break;
        }
        case Algorythm::AES256: {
            keyLength = 32;
            break;
        }
        default: {
            // do nothing
            break;
        }
    }
    if (isPassword()) {
        if (rounds < 100) // value 100 was ported from java network project
            throw std::invalid_argument("should be more than 1000 rounds for PRF");
        if (keyLength < 16)
            throw std::invalid_argument("key should be at least 16 bytes for PRF");
        if (salt == nullptr)
            salt = std::make_shared<byte_vector>(stringToBytes("attesta"));
    }
}

bool KeyInfo::isPassword() {
    return prf != PRF::None;
}

crypto::SymmetricKey KeyInfo::derivePassword(const std::string& pswd) {
    if (!isPassword())
        throw std::runtime_error("not the PRF keyInfo");
    crypto::HashType hashType = crypto::HashType::SHA256;
    switch (prf) {
        case PRF::HMAC_SHA1: {
            hashType = crypto::HashType::SHA1;
            break;
        }
        case PRF::HMAC_SHA256: {
            hashType = crypto::HashType::SHA256;
            break;
        }
        case PRF::HMAC_SHA512: {
            hashType = crypto::HashType::SHA512;
            break;
        }
        default: {
            throw std::invalid_argument("unknown hash scheme for pbkdf2");
        }
    }
    byte_vector key = PBKDF2::derive(hashType, pswd, *salt, rounds, keyLength);
    return crypto::SymmetricKey(key);
}

byte_vector KeyInfo::pack() {
    BossSerializer::Writer w;
    w.writeObject(UInt((int)algorythm));
    if (tag != nullptr) {
        byte_vector bv = *tag;
        w.writeObject(UBytes(std::move(bv)));
    } else {
        w.writeObject(UObject());
    }
    w.writeObject(UInt((int)prf));
    w.writeObject(UInt(keyLength));
    if (isPassword()) {
        w.writeObject(UInt(0));
        w.writeObject(UInt(rounds));
    }
    byte_vector bv = *salt;
    w.writeObject(UBytes(std::move(bv)));
    return w.getBytes().get();
}
