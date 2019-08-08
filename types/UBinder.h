//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UBINDER_H
#define UNITOOLS_UBINDER_H

#include <string>
#include <memory>
#include <algorithm>
#include "UObject.h"
#include <map>
#include <functional>
class UArray;

class UBinder : public UObject {

private:
    class UBinderData : public UData {
    public:
        UBinderData(std::initializer_list<std::map<std::string, UObject>::value_type> ilist);
        UBinderData();
        ~UBinderData() override;

        Local<Object> serializeToV8(Isolate *isolate) override {
            auto res = Object::New(isolate);
            for (auto& it: binder)
                res->Set(String::NewFromUtf8(isolate, it.first.data()), it.second.serializeToV8(isolate));
            return res;
        };

        std::map<std::string, UObject> binder;
    };

    template <typename T> const T& get(const std::string& key) const;
    template <typename T> T& get(const std::string& key);
    template <typename T> const T& getOrNull(const std::string& key) const;
    template <typename T> T& getOrNull(const std::string& key);


public:

    const UObject& get(const std::string& key) const;
    UObject& get(const std::string& key);

    double getDouble(const std::string& key) const;
    double getDoubleOrDefault(const std::string& key, double def) const;

    const std::string& getString(const std::string& key) const;
    const std::string& getStringOrDefault(const std::string& key, const std::string& def) const;


    int64_t getInt(const std::string& key) const;
    int64_t getIntOrDefault(const std::string& key, int64_t def) const;

    bool getBool(const std::string& key) const;
    bool getBoolOrDefault(const std::string& key, bool def) const;

    const UBinder& getBinder(const std::string& key) const;
    UBinder& getBinder(const std::string& key);
    const UArray& getArray(const std::string& key) const;
    UArray& getArray(const std::string& key);


    static bool isInstance(const UObject& object);
    static UBinder& asInstance(UObject& object);

    static const UBinder& asInstance(const UObject& object);

    UArray flat(int depth) const;
    UBinder map(std::function<const UObject(const std::string& key, const UObject& value)> transformator) const;
    UArray flatMap(std::function<const UObject(const std::string& key, const UObject& value)> transformator) const;
    UBinder filter(std::function<bool (const std::string& key, const UObject& value)> transformator) const;



    void set(const std::string& key, const UObject& value);
    void set(const std::string& key, double value);
    void set(const std::string& key, int64_t value);
    void set(const std::string& key, int value);
    void set(const std::string& key, bool value);
    void set(const std::string& key, const std::string& value);
    void set(const std::string& key, const char*);


    template <typename Key, typename Value>
    static UBinder of(const Key& key, Value value) {
        UBinder b;
        b.set(std::string(key),value);
        return b;
    }


    //creating binder from var-arg key-value pairs
    template <typename Key, typename Value, typename... Rest>
    static UBinder of(const Key& key, Value value, Rest... args)
    {
        const auto& bRest = UBinder::of(args...);
        auto bFrist = UBinder::of(key,value);
        bFrist.insert(bRest.begin(),bRest.end());
        return bFrist;
    }


    /*
     * FROM std::map BEGIN
     */

    typedef  std::map<std::string,UObject>::reverse_iterator reverse_iterator;
    typedef  std::map<std::string,UObject>::const_reverse_iterator const_reverse_iterator;
    typedef  std::map<std::string,UObject>::iterator iterator;
    typedef  std::map<std::string,UObject>::const_iterator const_iterator;
    typedef  std::map<std::string,UObject>::size_type size_type;
    typedef  std::map<std::string,UObject>::reference reference;
    typedef  std::map<std::string,UObject>::const_reference const_reference;
    typedef  std::map<std::string,UObject>::value_type value_type;


    UBinder();


    UBinder(std::initializer_list<value_type> ilist );


    iterator begin() noexcept;

    const_iterator begin() const noexcept;

    const_iterator cbegin() const noexcept;

    iterator end() noexcept;

    const_iterator end() const noexcept;

    const_iterator cend() const noexcept;


    reverse_iterator rbegin() noexcept;

    const_reverse_iterator rbegin() const noexcept;

    const_reverse_iterator crbegin() const noexcept;

    reverse_iterator rend() noexcept;

    const_reverse_iterator rend() const noexcept;

    const_reverse_iterator crend() const noexcept;

    bool empty() const noexcept;

    size_type size() const noexcept;

    size_type max_size() const noexcept;

    void clear() noexcept;

    template< class... Args >
    iterator emplace( const_iterator pos, Args&&... args );

    iterator erase( const_iterator pos );

    iterator erase( const_iterator first, const_iterator last );

    void swap( UBinder other );

    std::pair<iterator,bool> insert( const value_type& value );
    template< class P >
    std::pair<iterator,bool> insert( P&& value );
    iterator insert( const_iterator hint, const value_type& value );

    template< class P >
    iterator insert( const_iterator hint, P&& value );


    void insert( const_iterator first, const_iterator last );

    void insert( std::initializer_list<value_type> ilist );

    size_type count( const std::string& key ) const;

    template< class K >
    size_type count( const K& x ) const;

    iterator find( const std::string& key );

    const_iterator find( const std::string& key ) const;

    template< class K > iterator find( const K& x );

    template< class K > const_iterator find( const K& x ) const;


    std::pair<iterator,iterator> equal_range( const std::string& key );

    std::pair<const_iterator,const_iterator> equal_range( const std::string& key ) const;

    template< class K >
    std::pair<iterator,iterator> equal_range( const K& x );

    template< class K >
    std::pair<const_iterator,const_iterator> equal_range( const K& x ) const;

    iterator lower_bound( const std::string& key );

    const_iterator lower_bound( const std::string& key ) const;

    template< class K >
    iterator lower_bound(const K& x);

    template< class K >
    const_iterator lower_bound(const K& x) const;

    iterator upper_bound( const std::string& key );

    const_iterator upper_bound( const std::string& key ) const;

    template< class K >
    iterator upper_bound( const K& x );

    template< class K >
    const_iterator upper_bound( const K& x ) const;

    std::insert_iterator<std::map<std::string,UObject>> endInserter();

    /*
     * FROM std::map END
    */

};


#endif //UNITOOLS_UOBJECT_H
