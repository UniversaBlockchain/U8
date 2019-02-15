import {expect, assert, unit} from 'test'
import {tcp, udp} from 'network'

async function report(block) {
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
        await report(async () => {
            serverReads = await connection.input.readLine();
            await connection.output.write("hello!\n");
            connection.close();
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
    server.close();
});

unit.test("simple udp", async () => {

    let sock1 = udp.open({port: 18157}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18158}, (error) => {
        unit.fail("open failed: " + error);
    });

    sock1.recv(100, async (data, IP, port) => {
        await report(async () => {
            expect.equal(data, "qwerty");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18158, "check port");

            sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    sock2.recv(100, async (data, IP, port) => {
        await report(async () => {
            expect.equal(data, "123");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18157, "check port");

            await sock2.send("qwerty", {port: 18157});

            sock2.close();
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
        await report(async () => {
            assert(((data === "qwerty") || (data === "1234567")), "check data");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18108, "check port");

            packets++;
            if (packets === 2)
                sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    await sock2.send("qwerty", {port: 18107});
    await sock2.send("1234567", {port: 18107});

    sock2.close();
});