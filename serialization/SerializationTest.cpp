//
// Created by Dmitriy Tairov on 24.01.19.
//

#include "SerializationTest.h"
#include "BossSerializer.h"
#include "../types/UArray.h"
#include "../types/UInt.h"
#include "../types/UDouble.h"
#include "../types/UDateTime.h"
#include "../types/TestComplexObject.h"

#define ASSERT(expr)                                      \
 do {                                                     \
  if (!(expr)) {                                          \
    fprintf(stderr,                                       \
            "Assertion failed in %s on line %d: %s\n",    \
            __FILE__,                                     \
            __LINE__,                                     \
            #expr);                                       \
    abort();                                              \
  }                                                       \
 } while (0)

void allSerializationTests() {
    testBaseSerialization();
    testDeserializeUnknown();
    testBoss();
    testBossStreamMode();
}

void testBaseSerialization() {
    printf("testBaseSerialization()...\n");

    TestComplexObject complexObject("Simple name", 300000);

    TestComplexObject complexObject1("Obj1", 11111);
    TestComplexObject complexObject2("Obj2", 22222);
    TestComplexObject complexObject3("Obj3", 33333);

    UArray complexObjectArray = {complexObject1, complexObject2, complexObject3};

    auto insideBinder = UBinder::of("complex", complexObject, "other_key", "qwerty", "array_key", complexObjectArray);

    UDouble uDouble(334541.12454);
    auto binder = UBinder::of("key1", -10.85, "key2", uDouble, "key4", "some string", "inside_binder", insideBinder);
    ASSERT(binder.size() == 4);

    UObject obj = BaseSerializer::serialize(binder);

    ASSERT(UBinder::isInstance(obj));

    // check serialize TestComplexObjects
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("complex")));
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").getArray("array_key")[0]));
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").getArray("array_key")[1]));
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").getArray("array_key")[2]));

    auto des = BaseSerializer::deserialize(obj);
    ASSERT(UBinder::isInstance(des));
    UBinder& desBinder = UBinder::asInstance(des);

    ASSERT(desBinder.size() == 4);

    // check deserialize TestComplexObjects
    ASSERT(desBinder.getBinder("inside_binder").getArray("array_key").size() == 3);
    ASSERT(TestComplexObject::isInstance(desBinder.getBinder("inside_binder").get("complex")));
    ASSERT(TestComplexObject::isInstance(desBinder.getBinder("inside_binder").getArray("array_key")[0]));
    ASSERT(TestComplexObject::isInstance(desBinder.getBinder("inside_binder").getArray("array_key")[1]));
    ASSERT(TestComplexObject::isInstance(desBinder.getBinder("inside_binder").getArray("array_key")[2]));

    ASSERT(TestComplexObject::asInstance(desBinder.getBinder("inside_binder").get("complex")).getName() == "Simple name");
    ASSERT(TestComplexObject::asInstance(desBinder.getBinder("inside_binder").getArray("array_key")[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(desBinder.getBinder("inside_binder").getArray("array_key")[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(desBinder.getBinder("inside_binder").getArray("array_key")[2]).getAmount() == 33333);

    printf("testBaseSerialization()...done\n\n");
}

void testDeserializeUnknown() {
    printf("testDeserializeUnknown()...\n");

    TestComplexObject complexObject("Simple name", 300000);

    auto binder = UBinder::of("complex", complexObject);

    UObject obj = BaseSerializer::serialize(binder);

    ASSERT(UBinder::isInstance(obj));
    ASSERT(UBinder::asInstance(obj).getBinder("complex").getString("__type") == "TestComplexObject");
    UBinder::asInstance(obj).getBinder("complex").set("__type", "UnknownType");

    bool errorDeserialize = false;
    try {
        auto des = BaseSerializer::deserialize(obj);
    } catch (std::invalid_argument invalid_argument) {
        printf("%s\n", invalid_argument.what());
        std::string expected = "Unknown object type for deserialization";
        errorDeserialize = true;

        ASSERT(std::string(invalid_argument.what()).compare(0, expected.size(), expected) == 0);
    }

    ASSERT(errorDeserialize);

    printf("testDeserializeUnknown()...done\n\n");
}

void testBoss() {
    printf("testBoss()...\n");

    UDateTime time(std::chrono::high_resolution_clock::now());
    UString str("Новая строка!!! №13579; ---=== NEW_DATA");

    std::vector<unsigned char> bb;
    bb.push_back('1');
    bb.push_back('b');
    bb.push_back('=');
    bb.push_back('*');
    UBytes bytes(bb.data(), bb.size());

    TestComplexObject complexObject("Simple name", 300000);

    TestComplexObject complexObject1("Obj1", 11111);
    TestComplexObject complexObject2("Obj2", 22222);
    TestComplexObject complexObject3("Obj3", 33333);

    UArray complexObjectArray = {complexObject1, complexObject2, complexObject3};

    auto insideBinder = UBinder::of("complex", complexObject, "now_time", time, "other_key", "qwerty",
                                    "array_key", complexObjectArray, "dupl_array_key", complexObjectArray);

    UDouble uDouble(334541.12454);
    auto binder = UBinder::of("key1", -1.0, "key2", uDouble, "key3", 102930208, "key4", "some string", "key5", str,
                              "inside_binder", insideBinder, "array_key", complexObjectArray, "inside_binder2", insideBinder, "=0=", nullObject,
                              "some string", complexObjectArray, "Бинарные данные", bytes, "test_bool", true, "test_bool2", false,
                              "", "", " ", UBytes(nullptr, 0), "_", UArray(), "~", UBinder(),
                              "1", "", "2", UBytes(nullptr, 0), "3", UArray(), "4", UBinder());

    UBytes pack = BossSerializer::serialize(binder);

    UObject obj = BossSerializer::deserialize(pack);

    // Check obj
    ASSERT(UBinder::isInstance(obj));
    ASSERT(UBinder::asInstance(obj).getDouble("key1") == -1.0);
    ASSERT(UBinder::asInstance(obj).getDouble("key2") == 334541.12454);
    ASSERT(UBinder::asInstance(obj).getInt("key3") == 102930208);
    ASSERT(UBinder::asInstance(obj).getString("key4") == "some string");
    ASSERT(UBinder::asInstance(obj).getString("key5") == "Новая строка!!! №13579; ---=== NEW_DATA");
    ASSERT(UBytes::isInstance(UBinder::asInstance(obj).get("Бинарные данные")));
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().second == 4);
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().first[0] == '1');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().first[1] == 'b');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().first[2] == '=');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().first[3] == '*');
    ASSERT(UBinder::asInstance(obj).get("=0=").isNull());
    ASSERT(UBinder::asInstance(obj).getBool("test_bool"));
    ASSERT(!UBinder::asInstance(obj).getBool("test_bool2"));
    ASSERT(UBinder::asInstance(obj).getString("") == "");
    ASSERT(UBytes::isInstance(UBinder::asInstance(obj).get(" ")));
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get(" ")).get().second == 0);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).get("_")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).get("_")).size() == 0);
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).get("~")));
    ASSERT(UBinder::asInstance(UBinder::asInstance(obj).get("~")).size() == 0);
    ASSERT(UBinder::asInstance(obj).getString("1") == "");
    ASSERT(UBytes::isInstance(UBinder::asInstance(obj).get("2")));
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("2")).get().second == 0);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).get("3")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).get("3")).size() == 0);
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).get("4")));
    ASSERT(UBinder::asInstance(UBinder::asInstance(obj).get("4")).size() == 0);

    ASSERT(UBinder::asInstance(obj).getBinder("inside_binder").getString("other_key") == "qwerty");
    ASSERT(TestComplexObject::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("complex")));
    ASSERT(TestComplexObject::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("complex")).getName() == "Simple name");
    ASSERT(TestComplexObject::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("complex")).getAmount() == 300000);
    ASSERT(UDateTime::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("now_time")));
    ASSERT(UDateTime::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("now_time")).get().time_since_epoch().count()
           / std::chrono::high_resolution_clock::period::den == time.get().time_since_epoch().count() / std::chrono::high_resolution_clock::period::den);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("array_key"))[2]).getAmount() == 33333);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder").get("dupl_array_key"))[2]).getAmount() == 33333);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).get("array_key")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).get("array_key")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("array_key"))[2]).getAmount() == 33333);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).get("some string")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).get("some string")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).get("some string"))[2]).getAmount() == 33333);
    ASSERT(UBinder::asInstance(obj).getBinder("inside_binder2").getString("other_key") == "qwerty");
    ASSERT(TestComplexObject::isInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("complex")));
    ASSERT(TestComplexObject::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("complex")).getName() == "Simple name");
    ASSERT(TestComplexObject::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("complex")).getAmount() == 300000);
    ASSERT(UDateTime::isInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("now_time")));
    ASSERT(UDateTime::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("now_time")).get().time_since_epoch().count()
           / std::chrono::high_resolution_clock::period::den == time.get().time_since_epoch().count() / std::chrono::high_resolution_clock::period::den);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("array_key"))[2]).getAmount() == 33333);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key")).size() == 3);
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[0]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[1]));
    ASSERT(TestComplexObject::isInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[2]));
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[0]).getName() == "Obj1");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[1]).getName() == "Obj2");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[2]).getName() == "Obj3");
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[0]).getAmount() == 11111);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[1]).getAmount() == 22222);
    ASSERT(TestComplexObject::asInstance(UArray::asInstance(UBinder::asInstance(obj).getBinder("inside_binder2").get("dupl_array_key"))[2]).getAmount() == 33333);

    printf("Unpacked object check successful\n");

    // Repack test
    std::vector<unsigned char> buf;
    buf.assign(pack.get().first, pack.get().first + pack.get().second);

    UBytes repack = BossSerializer::serialize(obj);
    std::vector<unsigned char> repack_buf;
    repack_buf.assign(repack.get().first, repack.get().first + repack.get().second);

    ASSERT(buf.size() == repack_buf.size());

    for (int i = 0; i < buf.size(); i++)
        ASSERT(buf[i] == repack_buf[i]);

    printf("Repack object test successful\n");

    printf("testBoss()...done\n\n");
}

void testBossStreamMode() {
    printf("testBossStreamMode()...\n");

    BossSerializer::Writer writer;
    writer.setStreamMode();
    writer.writeObject(UString("test string #1"));
    writer.writeObject(UString("test string #1"));
    writer.writeObject(UString("test string #1"));
    writer.writeObject(UString("test string #2"));
    writer.writeObject(UString("test string #2"));
    writer.writeObject(UString("test string #3"));
    writer.writeObject(UString("test string #4"));
    writer.writeObject(UString("test string #5"));
    writer.writeObject(UString("test string #6"));
    writer.writeObject(UString("test string #7"));
    writer.writeObject(UString("test string #4"));
    writer.writeObject(UString("test string #8"));
    writer.writeObject(UString("test string #8"));

    UBytes bb = writer.getBytes();
    BossSerializer::Reader reader(bb);
    UObject obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #1");
    reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #1");
    reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #1");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #2");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #2");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #3");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #4");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #5");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #6");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #7");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #4");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #8");
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #8");

    printf("testBossStreamMode()...done\n\n");
}