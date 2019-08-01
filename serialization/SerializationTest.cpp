//
// Created by Dmitriy Tairov on 24.01.19.
//

#include "SerializationTest.h"
#include "BossSerializer.h"
#include "../types/UArray.h"
#include "../types/UBool.h"
#include "../types/UInt.h"
#include "../types/UDouble.h"
#include "../types/UDateTime.h"
#include "../types/TestComplexObject.h"
#include "../types/complex/UHashId.h"
#include "../tools/tools.h"
#include "../crypto/HashId.h"
#include "../crypto/base64.h"
#include "../types/complex/URole.h"

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
    testUHashId();
    testUListRole();
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
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().size() == 4);
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().data()[0] == '1');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().data()[1] == 'b');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().data()[2] == '=');
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("Бинарные данные")).get().data()[3] == '*');
    ASSERT(UBinder::asInstance(obj).get("=0=").isNull());
    ASSERT(UBinder::asInstance(obj).getBool("test_bool"));
    ASSERT(!UBinder::asInstance(obj).getBool("test_bool2"));
    ASSERT(UBinder::asInstance(obj).getString("") == "");
    ASSERT(UBytes::isInstance(UBinder::asInstance(obj).get(" ")));
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get(" ")).get().size() == 0);
    ASSERT(UArray::isInstance(UBinder::asInstance(obj).get("_")));
    ASSERT(UArray::asInstance(UBinder::asInstance(obj).get("_")).size() == 0);
    ASSERT(UBinder::isInstance(UBinder::asInstance(obj).get("~")));
    ASSERT(UBinder::asInstance(UBinder::asInstance(obj).get("~")).size() == 0);
    ASSERT(UBinder::asInstance(obj).getString("1") == "");
    ASSERT(UBytes::isInstance(UBinder::asInstance(obj).get("2")));
    ASSERT(UBytes::asInstance(UBinder::asInstance(obj).get("2")).get().size() == 0);
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
    buf.assign(pack.get().data(), pack.get().data() + pack.get().size());

    UBytes repack = BossSerializer::serialize(obj);
    std::vector<unsigned char> repack_buf;
    repack_buf.assign(repack.get().data(), repack.get().data() + repack.get().size());

    ASSERT(buf.size() == repack_buf.size());

    for (int i = 0; i < buf.size(); i++)
        ASSERT(buf[i] == repack_buf[i]);

    printf("Repack object test successful\n");

    std::vector<UObject> objs;
    objs.push_back(binder);
    objs.push_back(UString("test string #1"));
    objs.push_back(UDouble(803290.728));
    objs.push_back(UInt(-183918));
    objs.push_back(binder);
    objs.push_back(UBool(true));

    UBytes dump = BossSerializer::dump(objs);

    BossSerializer::Reader reader(dump);
    obj = reader.readObject();
    ASSERT(UBinder::isInstance(obj));
    ASSERT(UBinder::asInstance(obj).size() == 21);
    obj = reader.readObject();
    ASSERT(UString::isInstance(obj));
    ASSERT(UString::asInstance(obj).get() == "test string #1");
    obj = reader.readObject();
    ASSERT(UDouble::isInstance(obj));
    ASSERT(UDouble::asInstance(obj).get() == 803290.728);
    obj = reader.readObject();
    ASSERT(UInt::isInstance(obj));
    ASSERT(UInt::asInstance(obj).get() == -183918);
    obj = reader.readObject();
    ASSERT(UBinder::isInstance(obj));
    ASSERT(UBinder::asInstance(obj).size() == 21);
    obj = reader.readObject();
    ASSERT(UBool::isInstance(obj));
    ASSERT(UBool::asInstance(obj).get());

    printf("Dump test successful\n");

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

void testUHashId() {
    printf("testUHashId()...\n");
    using std::cout, std::endl;

    byte_vector binFromJava = base64_decodeToBytes("HhdTY29tcG9zaXRlM7xAl4F/B8H+DedzoERRN6gRH9PwPrMcY3tLGBKATgkctqpyhVQhHN+rG3/oJp60N42VXC0j0vtX9qborFDQCBes4jNfX3R5cGUzSGFzaElkFx28QBVhk4xkDobzVK4Jg2v9g0d4nxc/gnsjl+7Oge65zPJpATFMOhnoPgker5pVBqKOGclRq+0YU7MbEmEtuekj0d8tNRcdvECePVw+quqmmlXgMkvgsQa0qlGo6NJuOr2CQwJQnjiXO1v/mKYR0W+FiBWUuqjTkQw1OxqX1OXRi3I38pVdgNsKLTU=");
    crypto::HashId hashId0 = crypto::HashId::withDigest(base64_decodeToBytes("l4F/B8H+DedzoERRN6gRH9PwPrMcY3tLGBKATgkctqpyhVQhHN+rG3/oJp60N42VXC0j0vtX9qborFDQCBes4g"));
    crypto::HashId hashId1 = crypto::HashId::withDigest(base64_decodeToBytes("FWGTjGQOhvNUrgmDa/2DR3ifFz+CeyOX7s6B7rnM8mkBMUw6Geg+CR6vmlUGoo4ZyVGr7RhTsxsSYS256SPR3w"));
    crypto::HashId hashId2 = crypto::HashId::withDigest(base64_decodeToBytes("nj1cPqrqpppV4DJL4LEGtKpRqOjSbjq9gkMCUJ44lztb/5imEdFvhYgVlLqo05EMNTsal9Tl0YtyN/KVXYDbCg"));
    UObject obj = BossSerializer::deserialize(UBytes(move(binFromJava)));
    UArray arr = UArray::asInstance(obj);
    ASSERT(arr.size() == 3);
    ASSERT(hashId0 == UHashId::asInstance(arr[0]).getHashId());
    ASSERT(hashId1 == UHashId::asInstance(arr[1]).getHashId());
    ASSERT(hashId2 == UHashId::asInstance(arr[2]).getHashId());
    byte_vector cppSerializedBin = BossSerializer::serialize(arr).get();
    UObject obj2 = BossSerializer::deserialize(UBytes(move(cppSerializedBin)));
    UArray arr2 = UArray::asInstance(obj2);
    ASSERT(arr2.size() == 3);
    ASSERT(hashId0 == UHashId::asInstance(arr2[0]).getHashId());
    ASSERT(hashId1 == UHashId::asInstance(arr2[1]).getHashId());
    ASSERT(hashId2 == UHashId::asInstance(arr2[2]).getHashId());

    printf("testUHashId()...done\n\n");
}

void testUListRole() {
    printf("testUListRole()...\n");
    using std::cout, std::endl;

    byte_vector binFromJava = base64_decodeToBytes("LyNtb2RlG0FMTCtyb2xlcx4vS2FkZHJlc3Nlcw4XM19fdHlwZVNLZXlBZGRyZXNzQ3VhZGRyZXNzvCUQsXaZqpBDI3SuGBgebTR66dRKYPpSkInEp7jHCEtCInmrXhB+I2tleXMGVVNTaW1wbGVSb2xlI25hbWUTcjI7YW5vbklkc30vPRYXVV1lvCUQz7FDcou+Z6evO9X1uvKOaArPdCEczcePfWYFMYHMAYdf/5kKF1VdZbwlEGZQocH3UGgDQ/ZLXiUpUzJ0UfhyZxcC4NazcjhNoM1zo22hWnV9VYWNE3IznX0vPQ4XVV1lvDUQe8EJz220Si5SPqgBAS0DtyXN3sNAbO3hQ3X8GH/fXeN/2h3ZEs3anQ8rlIpIIPx53OJ3V3V9VYWNE3IxnX1VQ0xpc3RSb2xljRNsclNxdW9ydW1TaXplAA==");
    UObject obj = BossSerializer::deserialize(UBytes(move(binFromJava)));
    Role& role = URole::asInstance(obj).getRole();
    cout << "role.name: " << role.name << endl;
    auto& lr = (ListRole&) role;
    for (auto ir : lr.roles) {
        Role &r = *ir;
        cout << "  r.name: " << r.name << endl;
        auto &sr = dynamic_cast<SimpleRole &>(r);
        cout << "    keyAddresses.size: " << sr.keyAddresses.size() << endl;
        for (auto &ka : sr.keyAddresses)
            cout << "    ka: " << ka->toString() << endl;
    }

    //TODO: work in progress

    printf("testUListRole()...done\n\n");
}
