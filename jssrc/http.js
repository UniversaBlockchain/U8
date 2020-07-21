/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/*
This is a work in progress. Do not use, do not rely upon.
 */
import {TcpConnection, tcp} from 'network'
import {IoError} from 'io'

const http = {};

class UrlError extends Error {
    constructor(message="bad url") { super(message) }
}

function getConnection(url) {

}

let urlParser = /^(?:(.*):\/\/)?([^:/]+)(?::(\d+))?(\/[^?]+)?(\?.*)?$/

class URL {
    constructor(url) {
        let match = urlParser.exec(url)
        if (match) {
            [this.protocol, this.host, this.port, this.path, this.query] = [...match.slice(1)]
            if(this.port)
                this.port = +this.port;
        } else
            throw new UrlError("bad url: " + url);
    }

    toString() {
        let result = this.host;
        if( this.protocol ) result = `${this.protocol}://${result}`
        if( this.port ) result = `${result}:${port}`
        return result;
    }
}


http.Request = class {

    constructor(method, url, headers = new Map()) {
        [this.method, this.url, this.headers] = [method.toUpperCase(), url, headers]
    }

    execute() {
        // this.connection = getConnection(this.url)
        // this.puts()
    }

};

module.exports = { http, URL };