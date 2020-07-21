/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit} from 'test'
import {http, URL} from 'http'

// unit.test("simple http request", async () => {
//    let r = new http.Request('GET', "http://api.universa.io")
// });

unit.test("parse URL", async () => {
   let u = new URL("http://hello.com");
   expect.eq(u.protocol, "http");
   expect.eq(u.host, "hello.com");
   expect.isNull(u.port);
   expect.isNull(u.path);
   expect.isNull(u.query);
   expect.eq(u.toString(), "http://hello.com")

   u = new URL("https://hello.com:8080");
   expect.eq(u.protocol, "https");
   expect.eq(u.host, "hello.com");
   expect.eq(u.port, 8080);
   expect.isNull(u.path);
   expect.isNull(u.query);

   u = new URL("api.hello.com:8081/one/two");
   expect.isNull(u.protocol);
   expect.eq(u.host, "api.hello.com");
   expect.eq(u.path, "/one/two");
   expect.eq(u.port, 8081);
   expect.isNull(u.query);

   u = new URL("https://api.hello.com/one/two/three");
   expect.eq(u.protocol, "https");
   expect.eq(u.host, "api.hello.com");
   expect.eq(u.path, "/one/two/three");
   expect.isNull(u.port);
   expect.isNull(u.query);

   u = new URL("https://api.hello.com/one/two/three?foo=bar&bar=buzz");
   expect.eq(u.protocol, "https");
   expect.eq(u.host, "api.hello.com");
   expect.eq(u.path, "/one/two/three");
   expect.isNull(u.port);
   console.log("--> ", u.query)
   console.log("--> ", typeof u.query)
   console.log("--> ", typeof "foo=bar&bar=buzz")
   expect.eq(u.query, "foo=bar&bar=buzz");
});
