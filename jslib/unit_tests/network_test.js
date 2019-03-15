import {expect, assert, assertSilent, unit} from 'test'
import {tcp, tls, udp} from 'network'
import {now} from 'timers'

async function reportErrors(block) {
    try {
        return await block()
    } catch (e) {
        console.error(e);
    }
}

unit.test("simple tcp", async () => {

    let server = tcp.listen({port: 23102});
    let serverReads;

    let connectionProcessor = async (connection) => {
        await reportErrors(async () => {
            serverReads = await connection.input.readLine();
            await connection.output.write("hello!\n");
            await connection.close();
        });
    };

    server.accept(connectionProcessor, (error) => {
        unit.fail("accept failed: " + error);
    });

    let conn = await tcp.connect({host: "127.0.0.1", port: 23102});
    await conn.output.write("foobar\n");
    let ss = chomp(await conn.input.allAsString());
    expect.equal(ss, "hello!");
    expect.equal(serverReads, "foobar");
    await server.close();
});

unit.test("simple tls", async () => {

    let server = tls.listen({port: 23103, certFilePath: "../test/server-cert.pem", keyFilePath: "../test/server-key.pem"});
    let serverReads;

    let connectionProcessor = async (connection) => {
        await reportErrors(async () => {
            serverReads = await connection.input.readLine();
            await connection.output.write("hello!\n");
            await connection.close();
        });
    };

    server.accept(connectionProcessor, (error) => {
        unit.fail("accept failed: " + error);
    });

    let conn = await tls.connect({host: "127.0.0.1", port: 23103, certFilePath: "../test/server-cert.pem", keyFilePath: "../test/server-key.pem"});

    await conn.output.write("foobar\n");
    let ss = chomp(await conn.input.allAsString());
    expect.equal(ss, "hello!");
    expect.equal(serverReads, "foobar");
    await server.close();
});

unit.test("simple udp", async () => {

    let sock1 = udp.open({port: 18157}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18158}, (error) => {
        unit.fail("open failed: " + error);
    });

    sock1.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            expect.equal(data, "qwerty");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18158, "check port");

            await sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    sock2.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            expect.equal(data, "123");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18157, "check port");

            await sock2.send("qwerty", {port: 18157});

            await sock2.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    await sock1.send("123", {port: 18158});
});

unit.test("multi udp", async () => {

    let sock1 = udp.open({port: 18107}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18108}, (error) => {
        unit.fail("open failed: " + error);
    });

    let packets = 0;

    sock1.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            assert(((data === "qwerty") || (data === "1234567")), "check data");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18108, "check port");

            packets++;
            if (packets === 2)
                await sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    await sock2.send("qwerty", {port: 18107});
    await sock2.send("1234567", {port: 18107});

    let t0 = now();
    while(true) {
        await sleep(40);
        if (packets >= 2)
            break;
        if (now() - t0 > 1000)
            assert(false, "timeout");
    }
    assert(packets===2, "check received packets count");

    await sock2.close();
});

unit.test("multi udp 1000", async () => {

    let sock1 = udp.open({port: 18107}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18108}, (error) => {
        unit.fail("open failed: " + error);
    });

    let packets = 0;
    let promises = [];

    sock1.recv(100, async (data, IP, port) => {
        let p = new Promise(resolve => {
            packets++;
            assertSilent(((data === "qwerty") || (data === "1234567")), "check data");
            assertSilent(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip "+packets+": "+IP);
            assertSilent(port === 18108, "check port");
            resolve();
        });
        promises.push(p);
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    let t0 = now();
    let count_to_send = 1000;
    for (var i = 0; i < count_to_send; ++i) {
        await sock2.send("qwerty", {port: 18107});
    }

    while (promises.length < count_to_send)
        await sleep(10);
    await Promise.all(promises);

    let dt = now() - t0;
    //console.log("rate: " + (packets/dt*1000).toFixed(2) + " packets per second");
    assert(packets===count_to_send, "check received packets count");

    await sock1.close();
    await sock2.close();
});