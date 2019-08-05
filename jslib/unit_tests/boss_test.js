import {expect, unit, assert, assertSilent} from 'test'
const BossBiMapper = require("bossbimapper").BossBiMapper;
let roles = require("roles");

unit.test("pg_test: hello", async () => {
    let bin = atob("LyNtb2RlG0FMTCtyb2xlcx4vS2FkZHJlc3Nlcw4XM19fdHlwZVNLZXlBZGRyZXNzQ3VhZGRyZXNzvCUQsXaZqpBDI3SuGBgebTR66dRKYPpSkInEp7jHCEtCInmrXhB+I2tleXMGVVNTaW1wbGVSb2xlI25hbWUTcjI7YW5vbklkc30vPRYXVV1lvCUQz7FDcou+Z6evO9X1uvKOaArPdCEczcePfWYFMYHMAYdf/5kKF1VdZbwlEGZQocH3UGgDQ/ZLXiUpUzJ0UfhyZxcC4NazcjhNoM1zo22hWnV9VYWNE3IznX0vPQ4XVV1lvDUQe8EJz220Si5SPqgBAS0DtyXN3sNAbO3hQ3X8GH/fXeN/2h3ZEs3anQ8rlIpIIPx53OJ3V3V9VYWNE3IxnX1VQ0xpc3RSb2xljRNsclNxdW9ydW1TaXplAA==");
    //let role = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let role = await Boss.asyncLoad(bin);
    //role.__proto__ = roles.ListRole.prototype;
    console.log("role.constructor.name: " + role.constructor.name);
    console.log("role.name: " + role.name);
    for (let key in role.roles) {
        let r = role.roles[key];
        if (r.constructor.name !== "Function") {
            console.log("  r.constructor.name: " + r.constructor.name);
            console.log("  r.name: " + r.name);
            console.log("  r.keyAddresses.length: " + r.keyAddresses.size);
            r.keyAddresses.forEach(ka => {
                console.log("    keyAddress.constructor.name: " + ka.constructor.name);
                console.log("    keyAddress: " + ka);
            });
        }
    }
});
