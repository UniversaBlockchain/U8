# U8

U8 is the **JavaScript** + **C++** Universa-specific runtime environment implementation using [V8](https://v8.dev/) JavaScript engine.

Its primary purposes is to provide [Universa project](https://universablockchain.com) with the high-performance network-capable executing environment, capable of executing the business logic written on modern, convenient and programmers-friendly programming language, being also free of licensing issues (such as, the current Oracle policy of JDK licensing).

Being based on the V8 engine, it supports the modern flavor of JavaScript language (including ES7 standard features, such as `async`/`await`). Besides the great optimization capabilities of V8, it also has the optimized implementations of performance-critical Universa-specific functions and processes, written on clear C++ – essentially merging the power of low-level C++ code with the convenience of JavaScript. 


## Documentation

For the documentation on the U8 project, please view the [U8 page in Universa KB](https://kb.universablockchain.com/u8_home/150).

The latest documentation on the whole [Universa project](https://universablockchain.com) is available in Universa Knowledge Base at [kb.universablockchain.com](https://kb.universablockchain.com). For a visual guide on the documentation topics, visit the Universa Development Map at [lnd.im/UniversaDevelopmentMap](https://lnd.im/UniversaDevelopmentMap).


## Building

### Requirements

To build U8, you need the following packages installed:

* [Clang](https://releases.llvm.org) version 8 or higher – distributed within the [LLVM.org](https://llvm.org) project. This is the primary compiler used to build the project.
* [G++](https://gcc.gnu.org/) version 8 or higher – used to provide the standard C++ library for the Clang to compile.
* [Cmake](https://cmake.org), for the building process.

### Build procedure

~~~sh
cmake -S . -B build-release
cmake --build build-release --target all -- -j
~~~

After that, in the `build-release` directory you get the `u8` binary which may now execute the JavaScript scripts, like:

~~~
cd build-release
./u8 ../testmain.js
~~~


## Licensing

~~~
Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
~~~

At the current moment, no concrete license is defined yet for U8. During the active development stage, U8 is provided for trial and academic purposes only; for business licensing questions please contact us via [business@universa.co](mailto:business@universa.co).