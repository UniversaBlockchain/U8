// Launch as:
//   u8 helloworld.js
// or
//   u8 helloworld.js yourname

// async function main(args) {
//     console.log(`Hello, ${(args.length > 0)? args[0] : 'world'}!`);
//     return 0;
// }
//
//
// Launch as:
//   u8 helloworld.js
// or
//   u8 helloworld.js yourname

async function f() {
    await sleep(5 * 1000);
    return 5;
}

async function main(args) {
    console.log(`Hello, ${(args.length > 0)? args[0] : 'world'}!`);
    return f();
}
