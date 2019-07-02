import {expect, unit, assert} from 'test'
import {Ledger} from 'ledger'
import {udp} from 'network'

const HTTP = true;
const CRYPT = true;
const UDP = true;
const TIMERS = true;
const PG = true;
const ITERATIONS = 100;
const NODES = 10;

unit.test("stress_test", async () => {
    let PG_block = async () => {
        let ledger =  new Ledger("host=localhost port=5432 dbname=unit_tests");
        await ledger.init();

        for (let i = 0; i < ITERATIONS; i++)
            await ledger.countRecords();

        await ledger.close();
    };

    let UDP_block = async (num, dest) => {
        let sock = udp.open({port: 18207 + num}, (error) => {
            console.error("open failed: " + error);
        });

        sock.recv(100, async (data, IP, port) => {
            if (data !== "answer")
                await sock.send("answer", {port: port});
        }, (error) => {
            console.error("recv failed: " + error);
        });

        for (let i = 0; i < ITERATIONS; i++)
            await sock.send("request", {port: 18207 + dest});

        await sock.close();
    };

    for (let i = 0; i < NODES; i++) {
        if (UDP)
            await UDP_block(i, (i < 9) ? i + 1 : 0);

        if (PG)
            await PG_block();
    }
});