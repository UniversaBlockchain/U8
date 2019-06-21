import {expect, unit, assert, assertSilent} from 'test'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

unit.test("collection_test: GenericMap", async () => {
    let h1 = HashId.of(randomBytes(64));
    let h2 = HashId.of(randomBytes(64));

    let h1copy = crypto.HashId.withDigest(h1.digest);
    let h2copy = crypto.HashId.withDigest(h2.digest);

    assert(h1copy.equals(h1));
    assert(h2copy.equals(h2));

    let m = new t.GenericMap();

    m.set(h1, "h1");
    m.set(h2, "h2");

    assert(m.get(h1copy) === "h1");
    assert(m.get(h2copy) === "h2");

    assert(m.has(h1copy));
    assert(m.has(h2copy));

    assert (m.size === 2);

    assert(m.delete(h2copy));

    assert(m.get(h1copy) === "h1");
    assert(m.get(h2copy) == null);

    assert(m.has(h1copy));
    assert(!m.has(h2copy));

    assert (m.size === 1);

    assert(m.delete(h1copy));

    assert(m.get(h1copy) == null);
    assert(m.get(h2copy) == null);

    assert(!m.has(h1copy));
    assert(!m.has(h2copy));

    assert (m.size === 0);

    assert(m.get(HashId.of(randomBytes(64))) == null);
    assert(!m.has(HashId.of(randomBytes(64))));
    assert(!m.delete(HashId.of(randomBytes(64))));
});

unit.test("collection_test: GenericSet", async () => {
    let h1 = HashId.of(randomBytes(64));
    let h2 = HashId.of(randomBytes(64));

    let h1copy = crypto.HashId.withDigest(h1.digest);
    let h2copy = crypto.HashId.withDigest(h2.digest);

    assert(h1copy.equals(h1));
    assert(h2copy.equals(h2));

    let s = new t.GenericSet();

    s.add(h1);
    s.add(h2);

    assert(s.has(h1copy));
    assert(s.has(h2copy));

    assert (s.size === 2);

    let s2 = new t.GenericSet();

    s2.add(h2copy);
    s2.add(h1copy);

    assert(s2.equals(s));

    assert(s.delete(h2copy));

    assert(s.has(h1copy));
    assert(!s.has(h2copy));

    assert (s.size === 1);

    assert(s.delete(h1copy));

    assert(!s.has(h1copy));
    assert(!s.has(h2copy));

    assert (s.size === 0);

    assert(!s.has(HashId.of(randomBytes(64))));
    assert(!s.delete(HashId.of(randomBytes(64))));
});