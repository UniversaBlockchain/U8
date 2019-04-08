import {expect, unit, assert, assertSilent} from 'test'

class TestClass {
    constructor(pubKey, p1, p2, p3, p4, p5, p6, p7) {
        this.nodeInfo_ = new network.NodeInfoImpl(pubKey.packed, p1, p2, p3, p4, p5, p6, p7);
    }

    getNumber() {
        return this.nodeInfo_.__getNumber();
    }
}

unit.test("hello network", async () => {
    console.log();
    let newKey = await crypto.PrivateKey.generate(2048);
    let t0 = new Date().getTime();
    let i0 = 0;
    let sum = 0;
    let n = new TestClass(newKey.publicKey, 1, 2, 3, 4, 5, 6, 7);
    for (let i = 0; i < 1000; ++i) {
        sum += n.getNumber();
        //console.log(n.getNumber());
        if (new Date().getTime() - t0 >= 1000) {
            console.log("i = " + i + ", speed = " + (i - i0) + ", sum = " + sum);
            t0 = new Date().getTime();
            i0 = i;
        }
    }
    console.log(n);
});
