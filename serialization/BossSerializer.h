/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNIVERSA_BOSSSERIALIZER_H
#define UNIVERSA_BOSSSERIALIZER_H

#include "BaseSerializer.h"
#include "../types/UBytes.h"
#include "../types/UInt.h"
#include <vector>

class BossSerializer : public BaseSerializer {
public:
    enum BOSS_TYPES {
        TYPE_INT,
        TYPE_EXTRA,
        TYPE_NINT,
        TYPE_TEXT,
        TYPE_BIN,
        TYPE_CREF,
        TYPE_LIST,
        TYPE_DICT
    };

    enum BOSS_EXTRA_TYPES {
        XT_DZERO = 1, // double 0.0
        XT_DONE = 2, // double 1.0
        XT_DMINUSONE = 4, // double -1.0
        XT_DOUBLE = 7, // 64-bit IEEE float
        XT_TTRUE = 12,
        XT_FALSE = 13,
        XT_TIME = 15,
        XT_STREAM_MODE = 16
    };

    enum CACHE_TYPES {
        CT_BIN,
        CT_TEXT,
        CT_ARRAY,
        CT_BINDER
    };

    typedef std::vector<unsigned char> binary;
    typedef std::pair<CACHE_TYPES, binary> cachedObject;
    typedef std::map<cachedObject, unsigned long> cacheMap;

    BossSerializer() = default;

    /**
     * Serialize object known to BOSS. The object must inherit UObject.
     *
     * @param o is the root object to encode
     *
     * @return boss-packed data (@see UBytes)
     */
    static UBytes serialize(const UObject& o);

    /**
     * Serialize some objects to BOSS. The objects must inherit UObject.
     *
     * @param objs is vector of objects
     *
     * @return boss-packed data (@see UBytes)
     */
    static UBytes dump(std::vector<UObject> objs);

    /**
     * Deserialize object from boss-packed data
     *
     * @param data is boss-packed data for deserialization
     *
     * @return deserialized object (@see UObject)
     */
    static UObject deserialize(const UBytes& data);

private:
    class Header {
    public:
        Header(unsigned int code, unsigned long value);

        UInt getInt(bool negative);

        unsigned int code;
        unsigned long value;
    };

public:
    /**
     * BOSS serializer. Serialized object trees or, in stream mode, could be used to serialize a stream of objects.
     */
    class Writer {
    public:
        /**
         * Creates writer to write serialized object. Upon creation writer is always in tree mode.
         */
        Writer();

        /**
         * Turn encoder to stream mode (e.g. no cache). In stream mode the protocol do not never cache nor remember
         * references, so restored object tree will not correspond to sources as all shared nodes will be copied. Stream
         * mode is used in large streams to avoid unlimited cache growths.
         *
         * Stream more pushes the special record to the stream so the decoder (@see Reader) will know the more. Before
         * entering stream mode it is theoretically possible to write some cached trees, but this feature is yet
         * untested.
         */
        void setStreamMode();

        /**
         * Serialize single object known to BOSS. The object must inherit UObject.
         *
         * @param o is the root object to encode
         */
        void writeObject(const UObject& o);

        /**
         * Return packed bytes from writer
         *
         * @return boss-packed data (@see UBytes)
         */
        UBytes getBytes();

    private:
        cacheMap cache;
        binary buf;

        bool treeMode;

        Writer(bool treeMode);

        void put(const UObject& o);

        static unsigned int sizeInBytes(unsigned long value);

        void writeHeader(unsigned int code, unsigned long value);
        void writeEncoded(unsigned long value);

        bool tryWriteReference(cachedObject &obj);
        bool tryWriteReference(UBytes bytes);
        bool tryWriteReference(UString str);
        bool tryWriteReference(UArray array);
        bool tryWriteReference(UBinder binder);
    };

    /**
     * BOSS deserializer. Deserialized object trees or, in stream mode, could be used to deserialize a stream of objects.
     */
    class Reader {
    public:
        /**
         * Creates reader to read serialized object
         *
         * @param data is boss-packed data for deserialization
         */
        Reader(const UBytes& data);

        /**
         * Read next object from the stream
         *
         * @return next read object (@see UObject)
         */
        UObject readObject();

    private:
        std::vector<UObject> cache;
        const unsigned char* bin;
        const unsigned int size;
        unsigned int pos = 0;
        std::vector<unsigned long> recursive;

        bool treeMode;

        void setStreamMode();

        UObject get();

        Header readHeader();
        UObject readBinder(Header h);
        unsigned char readByte();
        unsigned long readEncodedLong();
        unsigned long readLong(unsigned long length);
        UObject parseExtra(int code);

        void cacheObject(UObject obj);
    };
};


#endif //UNIVERSA_BOSSSERIALIZER_H
