/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_HASHID_H
#define UNITOOLS_HASHID_H

#include <vector>
#include <string>
#include <memory>

namespace crypto {

/**
 * Hash-based identity v3.
 * <p>
 * v3 uses 3 orthogonal algorithms and concatenates its results to get slightly longer but much more strong hash.
 * <p>
 * The algorithms are:
 * <p>
 * 1) SHA-512/256, the strongest to the length extension attack SHA2 family variant
 * <p>
 * 2) SHA3-256, which is a different algorithm from sha2 family and is known to be very string
 * <p>
 * 3) ГОСТ Р 34.11-2012 "Stribog" which is a standard in Russian Federation make it eligible in this country. While this
 * hashing algorithm is suspected to be less strong than is stated, in conjunction with two more completely different
 * hashes it makes the result steel solid and bulletproof.
 * <p>
 * The overall compound hash, consisting of 3 concatenated hashes, requires an attacker to create collision on both 3 in
 * the same time which is way more complex task than finding collision on each of them, as, generally, collision on one
 * algorithm will not work with another.
 * <p>
 * The classic usage scenario is packed data of Approvable documents.
 * <p>
 * History.
 * <p>
 * First, the Syntex1 algorighm was used, giving additional protection against some attacks by combining SHA2
 * and CRC32 as protection against some future collision attacks.
 * <p>
 * Later, the SHA2-512 was used as its analyse shown very good results.
 * <p>
 * Finally, as Universa grows, more strength and more jurisdiction compliance were added with v3, having 3 independent
 * algorithms, 2 of them are recognized and recommended by NYST and one is required in Russian federation. We suppose
 * that these algorithms joined together are a very hard hash for the collision attack.
 * <p>
 * Created by sergeych on 16/07/2017.
 */
    class HashId {

    public:

        /**
         * Return new HashId calculating composite digest hash of the data.
         */
        static HashId of(const std::vector<unsigned char> &packedData);

        /**
         * \see HashId of(const std::vector<unsigned char>& packedData);
         */
        static HashId of(void *packedData, size_t packedDataSize);

        /**
         * Create instance from a saved digest (obtained before with getDigest())
         */
        static HashId withDigest(const std::vector<unsigned char> &digestData);

        /**
         * \see HashId withDigest(const std::vector<unsigned char>& digestData);
         */
        static HashId withDigest(void *digestData, size_t digestDataSize);

        /**
         * Create random new hashId. Mainly for testing purposes.
         */
        static HashId createRandom();

        HashId(const HashId &copyFrom);

        HashId(HashId &&moveFrom);

        std::string toBase64() const;

        std::vector<unsigned char> getDigest();

        bool operator<(const HashId &other) const;

        bool operator==(const HashId &other) const;

        size_t hashCode() const;

    public:
        /**
         * Use it with unordered_map, e.g.:
         * unordered_map&lt;HashId, int, HashId::UnorderedHash&gt;
         */
        struct UnorderedHash {
            size_t operator()(const HashId &val) const;
        };

    private:
        std::vector<unsigned char> digest;

        HashId() {}

        HashId(const std::vector<unsigned char> &packedData);

        HashId(void *data, size_t size);

        void initWith(void *data, size_t size);

    };

};

#endif //UNITOOLS_HASHID_H
