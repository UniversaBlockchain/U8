//
// Created by Dmitriy Tairov on 26.12.18.
//

#include "BaseSerializer.h"
#include "../types/UDouble.h"
#include "../types/UArray.h"
#include "../types/UBinder.h"
#include "../types/UDateTime.h"
#include "../types/UString.h"
#include "../types/UInt.h"
#include "../types/UBytes.h"
#include "../types/UBool.h"
#include "../types/TestComplexObject.h"
#include "../types/complex/UHashId.h"
#include "../types/complex/UListRole.h"
#include "../types/complex/USimpleRole.h"
#include "../types/complex/UKeyAddress.h"
#include "../types/complex/UKeyRecord.h"
#include "../types/complex/UPublicKey.h"

// Serialization object templates
template <typename T> UObject BaseSerializer::serializeObject(T o, std::string typeName) {
    UBinder result = o.decompose();
    result.set("__type", typeName);

    return result;

    //throw std::invalid_argument(std::string("Undefined serialize method for type: ") + typeid(o).name());
}

template <typename T> T BaseSerializer::deserializeObject(const UBinder& data) {
    T complex;
    complex.compose(data);

    return complex;

    //throw std::invalid_argument(std::string("Undefined deserialize method for type: ") + typeid(T).name());
}

// Template specializations
/*template <> UObject BaseSerializer::serializeObject(TestComplexObject& o) {
    UBinder result = o.compose();
    result.set("__type", "TestComplexObject");

    return result;
}

template <> TestComplexObject BaseSerializer::deserializeObject(const UBinder& data) {
    TestComplexObject complex;
    complex.decompose(data);

    return complex;
}*/

UObject BaseSerializer::skipBaseTypes(const UObject& o) {

    // Base types
    if (UBool::isInstance(o))
        return UBool::asInstance(o);
    if (UBytes::isInstance(o))
        return UBytes::asInstance(o);
    if (UDateTime::isInstance(o))
        return UDateTime::asInstance(o);
    if (UDouble::isInstance(o))
        return UDouble::asInstance(o);
    if (UInt::isInstance(o))
        return UInt::asInstance(o);
    if (UString::isInstance(o))
        return UString::asInstance(o);

    return nullObject;
}

// Macros for serialize complex types
#define serializeComplex(className, typeName) \
    if (className::isInstance(o)) \
        return serializeObject<className&>(className::asInstance((UObject&) o), typeName);

// Macros for deserialize complex types
#define deserializeComplex(className, typeName) \
    if (type == typeName) \
        return deserializeObject<className>(binder);

// Macros for all complex types serialization/deserialization
#define complexTypes(functionName) \
    functionName(TestComplexObject, "TestComplexObject"); \
    functionName(UHashId, "HashId"); \
    functionName(UListRole, "ListRole"); \
    functionName(USimpleRole, "SimpleRole"); \
    functionName(UKeyAddress, "KeyAddress"); \
    functionName(UKeyRecord, "KeyRecord"); \
    functionName(UPublicKey, "PublicKey");
    // TODO: add other complex types

UObject BaseSerializer::serialize(const UObject& o) {

    // Skip null and base types
    if (o.isNull())
        return o;

    UObject res = skipBaseTypes(o);
    if (!res.isNull())
        return res;

    // Binder
    if (UBinder::isInstance(o)) {
        const UBinder& binder = UBinder::asInstance(o);
        UBinder result;

        std::transform(binder.cbegin(), binder.cend(), result.endInserter(), [](UBinder::value_type const& value) {
            return UBinder::value_type(value.first, serialize(value.second));
        });
        return result;
    }

    // Array
    if (UArray::isInstance(o)) {
        const UArray& array = UArray::asInstance(o);
        UArray result;

        std::transform(array.cbegin(), array.cend(), result.endInserter(), [](UArray::value_type const& value) {
            return UArray::value_type(serialize(value));
        });
        return result;
    }

    // Complex types
    complexTypes(serializeComplex)

    throw std::invalid_argument(std::string("Invalid object type for serialization: ") + typeid(o).name());
}

UObject BaseSerializer::deserialize(const UObject& o) {

    // Skip null and base types
    if (o.isNull())
        return o;

    UObject res = skipBaseTypes(o);
    if (!res.isNull())
        return res;

    // Array
    if (UArray::isInstance(o)) {
        const UArray& array = UArray::asInstance(o);
        UArray result;

        std::transform(array.cbegin(), array.cend(), result.endInserter(), [](UArray::value_type const& value) {
            return UArray::value_type(deserialize(value));
        });
        return result;
    }

    // Binder
    std::string type;
    if (UBinder::isInstance(o)) {
        const UBinder& binder = UBinder::asInstance(o);
        const std::string _type = binder.getStringOrDefault("__type", "");

        if (_type.empty()) {
            const std::string _t = binder.getStringOrDefault("__t", "");
            if (!_t.empty())
                type = _t;
        }
        else
            type = _type;

        if (type.empty()) {
            UBinder result;

            std::transform(binder.cbegin(), binder.cend(), result.endInserter(), [](UBinder::value_type const& value) {
                return UBinder::value_type(value.first, deserialize(value.second));
            });
            return result;
        }

        // Complex types
        complexTypes(deserializeComplex)
    }

    throw std::invalid_argument(std::string("Unknown object type for deserialization: ") + typeid(o).name() + ", type=" + type);
}