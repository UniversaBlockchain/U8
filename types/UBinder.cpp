//
// Created by Roman Uskov on 2018-12-17.
//

#include "UBinder.h"
#include "UArray.h"
#include "UDouble.h"
#include "UInt.h"
#include "UBool.h"
#include "UString.h"

UArray UBinder::flat(int depth) const {
    auto result = UArray();

    for (auto it = cbegin(); it != cend(); it++) {

        if ((depth > 0) && UBinder::isInstance(it->second)) {
            auto inside = UBinder::asInstance(it->second).flat(depth - 1);

            if (!inside.empty())
                result.insert(result.end(), inside.cbegin(), inside.cend());
        } else if ((depth > 0) && UArray::isInstance(it->second)) {
            auto inside = UArray::asInstance(it->second).flat(depth - 1);

            if (!inside.empty())
                result.insert(result.end(), inside.cbegin(), inside.cend());
        } else
            result.push_back(it->second);
    }
    return result;
}

UBinder UBinder::map(std::function<const UObject(const std::string& key, const UObject& value)> transformator) const {
    auto result = UBinder();

    std::transform(cbegin(),cend(), result.endInserter(),[transformator](UBinder::value_type const& value) {
        return UBinder::value_type(value.first,transformator(value.first, value.second));
    });
    return result;
}

UArray UBinder::flatMap(std::function<const UObject(const std::string& key, const UObject& value)> transformator) const {
    return map(transformator).flat(1);
}

UBinder UBinder::filter(std::function<bool (const std::string& key, const UObject& value)> predicate) const {
    auto result = UBinder();

    std::copy_if(cbegin(),cend(),result.endInserter(),[predicate](UBinder::value_type const& kv_pair) {
        return predicate(kv_pair.first,kv_pair.second);
    });

    return result;
}

std::insert_iterator<std::map<std::string,UObject>> UBinder::endInserter() {
    return std::inserter(data<UBinderData>().binder,end());
}

void UBinder::swap(UBinder other) {
    data<UBinderData>().binder.swap(other.data<UBinderData>().binder);
}

UBinder::iterator UBinder::erase(UBinder::const_iterator first, UBinder::const_iterator last) {
    return data<UBinderData>().binder.erase(first,last);
}

UBinder::iterator UBinder::erase(UBinder::const_iterator pos) {
    return data<UBinderData>().binder.erase(pos);
}

template<class... Args>
UBinder::iterator UBinder::emplace(UBinder::const_iterator pos, Args &&... args) {
    return data<UBinderData>().binder.emplace(pos,args...);
}

void UBinder::clear() noexcept {
    data<UBinderData>().binder.clear();
}


UBinder::size_type UBinder::max_size() const noexcept {
    return data<UBinderData>().binder.max_size();
}

UBinder::size_type UBinder::size() const noexcept {
    return data<UBinderData>().binder.size();
}

bool UBinder::empty() const noexcept {
    return data<UBinderData>().binder.empty();
}

UBinder::const_reverse_iterator UBinder::crend() const noexcept {
    return data<UBinderData>().binder.crend();
}

UBinder::const_reverse_iterator UBinder::rend() const noexcept {
    return data<UBinderData>().binder.rend();
}

UBinder::reverse_iterator UBinder::rend() noexcept {
    return data<UBinderData>().binder.rend();
}

UBinder::const_reverse_iterator UBinder::crbegin() const noexcept {
    return data<UBinderData>().binder.crbegin();
}

UBinder::const_reverse_iterator UBinder::rbegin() const noexcept {
    return data<UBinderData>().binder.rbegin();
}

UBinder::reverse_iterator UBinder::rbegin() noexcept {
    return data<UBinderData>().binder.rbegin();
}

UBinder::const_iterator UBinder::cend() const noexcept {
    return data<UBinderData>().binder.cend();
}

UBinder::const_iterator UBinder::end() const noexcept {
    return data<UBinderData>().binder.end();
}

UBinder::iterator UBinder::end() noexcept {
    return data<UBinderData>().binder.end();
}

UBinder::const_iterator UBinder::cbegin() const noexcept {
    return data<UBinderData>().binder.cbegin();
}

UBinder::const_iterator UBinder::begin() const noexcept {
    return data<UBinderData>().binder.begin();
}

UBinder::iterator UBinder::begin() noexcept {
    return data<UBinderData>().binder.begin();
}




UBinder::UBinder(std::initializer_list<UBinder::value_type> ilist) : UObject(std::make_shared<UBinderData>(ilist)) {

}


UBinder::UBinder() : UObject(std::make_shared<UBinderData>()) {

}

bool UBinder::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UBinderData>();
}

template<class K>
UBinder::const_iterator UBinder::upper_bound(const K &x) const {
    return data<UBinderData>().binder.upper_bound(x);
}

template<class K>
UBinder::iterator UBinder::upper_bound(const K &x) {
    return data<UBinderData>().binder.upper_bound(x);
}

UBinder::const_iterator UBinder::upper_bound(const std::string &key) const {
    return data<UBinderData>().binder.upper_bound(key);
}

UBinder::iterator UBinder::upper_bound(const std::string &key) {
    return data<UBinderData>().binder.upper_bound(key);
}

template<class K>
UBinder::const_iterator UBinder::lower_bound(const K &x) const {
    return data<UBinderData>().binder.lower_bound(x);
}

template<class K>
UBinder::iterator UBinder::lower_bound(const K &x) {
    return data<UBinderData>().binder.lower_bound(x);
}

UBinder::const_iterator UBinder::lower_bound(const std::string &key) const {
    return data<UBinderData>().binder.lower_bound(key);
}

UBinder::iterator UBinder::lower_bound(const std::string &key) {
    return data<UBinderData>().binder.lower_bound(key);
}

template<class K>
std::pair<UBinder::const_iterator, UBinder::const_iterator> UBinder::equal_range(const K &x) const {
    return data<UBinderData>().binder.equal_range(x);
}

template<class K>
std::pair<UBinder::iterator, UBinder::iterator> UBinder::equal_range(const K &x) {
    return data<UBinderData>().binder.equal_range(x);
}

std::pair<UBinder::const_iterator, UBinder::const_iterator> UBinder::equal_range(const std::string &key) const {
    return data<UBinderData>().binder.equal_range(key);
}

std::pair<UBinder::iterator, UBinder::iterator> UBinder::equal_range(const std::string &key) {
    return data<UBinderData>().binder.equal_range(key);
}

template<class K>
UBinder::const_iterator UBinder::find(const K &x) const {
    return  data<UBinderData>().binder.find(x);
}

template<class K>
UBinder::iterator UBinder::find(const K &x) {
    return data<UBinderData>().binder.find(x);
}

UBinder::const_iterator UBinder::find(const std::string &key) const {
    return data<UBinderData>().binder.find(key);
}

UBinder::iterator UBinder::find(const std::string &key) {
    return data<UBinderData>().binder.find(key);
}

template<class K>
UBinder::size_type UBinder::count(const K &x) const {
    return data<UBinderData>().binder.count(x);
}

UBinder::size_type UBinder::count(const std::string &key) const {
    return data<UBinderData>().binder.count(key);
}

void UBinder::insert(std::initializer_list<UBinder::value_type> ilist) {
    return data<UBinderData>().binder.insert(ilist);
}

void UBinder::insert(const_iterator first, const_iterator last) {
    return data<UBinderData>().binder.insert(first,last);
}

template<class P>
UBinder::iterator UBinder::insert(UBinder::const_iterator hint, P &&value) {
    return data<UBinderData>().binder.insert(hint,value);
}

UBinder::iterator UBinder::insert(UBinder::const_iterator hint, const UBinder::value_type &value) {
    return data<UBinderData>().binder.insert(hint,value);
}

template<class P>
std::pair<UBinder::iterator, bool> UBinder::insert(P &&value) {
    return data<UBinderData>().binder.insert(value);
}

std::pair<UBinder::iterator, bool> UBinder::insert(const UBinder::value_type &value) {
    return data<UBinderData>().binder.insert(value);
}

UBinder::UBinderData::UBinderData(std::initializer_list<UBinder::value_type> ilist) :  binder(ilist) {

}

UBinder::UBinderData::UBinderData()   {

}

UBinder::UBinderData::~UBinderData() {

}




const UObject& UBinder::get(const std::string& key) const {
    auto it = find(key);
    if (it == end())
        return nullObject;

    return it->second;
}

UObject& UBinder::get(const std::string& key) {
    auto it = find(key);
    if (it == end())
        return nullObject;

    return it->second;
}

template <typename T> const T& UBinder::get(const std::string& key) const {
    const UObject& object  = get(key);

    if (object.isNull())
        throw std::invalid_argument("Key \"" + key + "\" not found in Binder");

    if (T::isInstance(object))
        return static_cast<const T&>(object);
    else
        throw std::invalid_argument("Value type founded by key \"" + key + "\" is not " + typeid(T).name());
}

template <typename T> T& UBinder::get(const std::string& key) {
    UObject& object  = get(key);

    if (object.isNull())
        throw std::invalid_argument("Key \"" + key + "\" not found in Binder");

    if (T::isInstance(object))
        return static_cast<T&>(object);
    else
        throw std::invalid_argument("Value type founded by key \"" + key + "\" is not " + typeid(T).name());
}

template <typename T> const T& UBinder::getOrNull(const std::string& key) const {
    const UObject& object  = get(key);

    if (object.isNull())
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wreturn-stack-address"
        return (const T&)nullObject;
#pragma clang diagnostic pop

    if (T::isInstance(object))
        return T::asInstance(object);
    else
        throw std::invalid_argument("Value type founded by key \"" + key + "\" is not " + typeid(T).name());
}

template <typename T> T& UBinder::getOrNull(const std::string& key) {
    T& object  = get(key);

    if (object.isNull())
        return (T&)nullObject;

    if (T::isInstance(object))
        return T::asInstance(object);
    else
        throw std::invalid_argument("Value type founded by key \"" + key + "\" is not " + typeid(T).name());
}

UBinder &UBinder::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UBinderData>())
        throw std::invalid_argument("object is not instance of UDouble");

    return (UBinder&)object;
}

const UBinder &UBinder::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UBinderData>())
        throw std::invalid_argument("object is not instance of UDouble");

    return (const UBinder&)object;
}



void UBinder::set(const std::string& key, const UObject& value) {
    UBinder::value_type pair(key, value);
    auto result = insert(pair);
    if(!result.second) {
        std::swap(result.first->second,pair.second);
    }
}

void UBinder::set(const std::string& key, double value) {
    set(key,UDouble(value));
}

void UBinder::set(const std::string& key, int64_t value) {
    set(key,UInt(value));
}
void UBinder::set(const std::string& key, int value) {
    set(key,UInt(value));
}
void UBinder::set(const std::string& key, bool value) {
    set(key,UBool(value));
}

void UBinder::set(const std::string& key, const std::string& value) {
    set(key,UString(value));
}

void UBinder::set(const std::string& key, const char* value) {
    set(key,std::string(value));
}


double UBinder::getDouble(const std::string& key) const {
    return get<UDouble>(key).get();
}

double UBinder::getDoubleOrDefault(const std::string &key, double def) const {
    const auto & object = getOrNull<UDouble>(key);
    if(object.isNull())
        return def;

    return object.get();
}

const std::string& UBinder::getString(const std::string& key) const {
    return get<UString>(key).get();
}
const std::string& UBinder::getStringOrDefault(const std::string& key, const std::string& def) const {
    const auto & object = getOrNull<UString>(key);
    if(object.isNull())
        return def;

    return object.get();
}


int64_t UBinder::getInt(const std::string& key) const {
    return get<UInt>(key).get();
}
int64_t UBinder::getIntOrDefault(const std::string& key, int64_t def) const{
    const auto & object = getOrNull<UInt>(key);
    if(object.isNull())
        return def;

    return object.get();
}

bool UBinder::getBool(const std::string& key) const {
    return get<UBool>(key).get();
}
bool UBinder::getBoolOrDefault(const std::string& key, bool def) const{
    const auto & object = getOrNull<UBool>(key);
    if(object.isNull())
        return def;

    return object.get();
}


const UBinder& UBinder::getBinder(const std::string& key) const {
    return get<UBinder>(key);
}

UBinder& UBinder::getBinder(const std::string& key) {
    return get<UBinder>(key);
}

const UArray& UBinder::getArray(const std::string& key) const {
    return get<UArray>(key);
}

UArray& UBinder::getArray(const std::string& key) {
    return get<UArray>(key);
}

