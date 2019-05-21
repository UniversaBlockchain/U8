import {expect, assert, unit} from 'test'

const Main = require("main").Main;

unit.test("main_test: checkOptionParsing", () => {
    let m = new Main("-h");

    assert(m.parser.options.has("?"));
    assert(m.parser.options.has("h"));
    assert(m.parser.options.has("help"));

    m = new Main("--test", "-c", "./path/config");

    assert(m.parser.options.has("test"));
    assert(m.parser.options.has("c"));
    assert(m.parser.options.has("config"));

    assert(!m.parser.values.has("test"));
    assert(m.parser.values.get("c") === "./path/config");
    assert(m.parser.values.get("config") === "./path/config");

    m = new Main("--config", "/full/path/test config", "-version");

    assert(m.parser.options.has("version"));
    assert(m.parser.options.has("c"));
    assert(m.parser.options.has("config"));

    assert(!m.parser.values.has("version"));
    assert(m.parser.values.get("c") === "/full/path/test config");
    assert(m.parser.values.get("config") === "/full/path/test config");

    m = new Main("--config", "./path/config2", "--test", "-verbose", "nothing", "-nolog", "--udp-verbose", "nothing", "--version");

    assert(m.parser.options.has("c"));
    assert(m.parser.options.has("config"));
    assert(m.parser.options.has("test"));
    assert(m.parser.options.has("verbose"));
    assert(m.parser.options.has("nolog"));
    assert(m.parser.options.has("udp-verbose"));
    assert(m.parser.options.has("version"));

    assert(!m.parser.values.has("test"));
    assert(!m.parser.values.has("nolog"));
    assert(!m.parser.values.has("version"));
    assert(m.parser.values.get("c") === "./path/config2");
    assert(m.parser.values.get("config") === "./path/config2");
    assert(m.parser.values.get("verbose") === "nothing");
    assert(m.parser.values.get("udp-verbose") === "nothing");
});