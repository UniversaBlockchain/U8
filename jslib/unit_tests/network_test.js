import {expect, unit} from 'test'
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
    expect.equal(ss, "hello!")
    expect.equal(serverReads, "foobar");
    server.close();
});

unit.test("simple udp", async () => {
    let udpProcessor1 = async (sock1) => {
        await sock1.recv(100, async (data, IP, port) => {
            await report(async () => {
                //expect.equal(data, "qwerty");
            });
        }, (error) => {
            unit.fail("recv failed: " + error);
        });

        await sock1.send("123", {port: 18158});

        await sock1.close();
    };

    let udpProcessor2 = async (sock2) => {
        await sock2.recv(100, async (data, IP, port) => {
            await report(async () => {
                //expect.equal(data, "123");
            });
        }, (error) => {
            unit.fail("recv failed: " + error);
        });

        await sock2.send("qwerty", {port: 18157});

        await sock2.close();
    };

    udp.open({port: 18157}, udpProcessor1, (error) => {
        unit.fail("open failed: " + error);
    });

    udp.open({port: 18158}, udpProcessor2, (error) => {
        unit.fail("open failed: " + error);
    });
});
