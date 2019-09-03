/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {unit, expect, assert} from 'test'

async function testSize(path, expectedSize) {
    let input = await io.openRead(path);
    let data = await input.allBytes();
    expect.equal(data.length, expectedSize);
}

unit.test("file read all", async () => {
    // let input = await io.openRead("../test/test.txt");
    // console.log(await input.allAsString());
    await testSize("../test/test.txt", 57);
    await testSize("../test/testcontract.unicon", 2589);
});


unit.test("input iterate bytes", async () => {
    let input = await io.openRead("../test/test.txt");
    await input.nextByte();
    await input.nextByte();
    let x = await input.read(12);
    assert("this is a te" == utf8Decode(x));
    assert(x.length == 12);
    await input.close();
});

unit.test("output write bytes", async () => {
    let output = await io.openWrite("../testbytes.bin", 'w', {umask: 0o777});
    let src = [0x30, 0x31, 0x32, 0x33];
    await output.write(src);
    await output.close();
    let input = await io.openRead("../testbytes.bin");
    let data = await input.allBytes();
    expect.equal( 4, data.length);
    expect.equalArrays(data, src );
    await input.close();

});
