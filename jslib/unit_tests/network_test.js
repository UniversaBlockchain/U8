import {expect, unit} from 'test'
import {tcp} from 'network'

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
