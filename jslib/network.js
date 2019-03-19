/**
 * @module network
 */

import {AsyncProcessor, InputStream, OutputStream, IoError} from 'io'

/**
 * The tcp connection class. Includes {#input} and {#output} streams.
 */
class TcpConnection {

    constructor(handle, bufferLength = chunkSize) {
        this._handle = handle;
        /**
         * Input stream associated with the connection.
         * @type {InputStream}
         */
        this.input = new InputStream(handle, bufferLength);
        /**
         * Output stream associated with the connection.
         * @type {OutputStream}
         */
        this.output = new OutputStream(handle, bufferLength);
    }

    /**
     * Close the connection.
     * @async
     * @returns {Promise<void>}
     */
    async close() {
        return this._handle.close();
    }

}

/**
 *  @constant
 *  @default
 */
const chunkSize = 1024;

/**
 * TCP server processes incoming connection using {accept} method.
 */
class TcpServer {
    /**
     * Construct server to listen for the incoming TCP/IP connection on the specified port and interface.
     *
     * Important note. The server actually will not start listening until the {accept()} call.
     *
     * @param {number} port - Port to listen.
     * @param {string} bindIp="0.0.0.0" - IP address for bind socket (IPv4 or IPv6).
     * @param {number} maxConnections=0 - The maximum number of connections allowed in the queue.
     * @param {number} bufferLength=chunkSize - Buffer length for the TcpConnection streams.
     */
    constructor({port, bindIp = "0.0.0.0", maxConnections = 0, bufferLength = chunkSize}) {
        [this.port, this.bindIp, this.maxConnections, this.bufferLength] = [port, bindIp, maxConnections, bufferLength];
    }

    /**
     * Accept incoming connection. Calls resolve(TcpConnection) on each incoming connection or
     * reject(error) if it is not possible.
     *
     * @param {function} resolve - Callback to process incoming connection passed as a single argument of type {TcpConnection}.
     * @param {function} reject - Callback to process errors. After it is called, the server may stop processing incoming connections.
     */
    accept(resolve, reject) {
        this.handle = new IOTCP();
        this.handle._listen(this.bindIp, this.port, (code) => {
            if (code < 0)
                reject(new IoError(code));
            else {
                try {
                    let connectionHandle = new IOTCP();
                    let result = connectionHandle._accept(this.handle);
                    if (result < 0)
                        reject(new IoError(result));
                    else
                        resolve(new TcpConnection(connectionHandle, this.bufferLength));
                } catch (e) {
                    reject(e);
                }
            }
        }, this.maxConnections);
    }

    /**
     * Stop listening for incoming connections.
     * @async
     * @return {Promise<*>}
     */
    async close() {
        return this.handle.close();
    }
}

/**
 * @namespace
 */
let tcp = {
    /**
     * Asynchronous init, bind and establish an IPv4 or IPv6 TCP connection.
     *
     * @async
     * @param {string} host - IP address of remote socket (IPv4 or IPv6).
     * @param {number} port - Port of remote socket.
     * @param {string} bindIp="0.0.0.0" - IP address for bind socket (IPv4 or IPv6).
     * @param {number} bindPort - Port for bind socket.
     * @param {number} bufferLength=chunkSize - Buffer length for the TcpConnection streams.
     * @return {Promise<TcpConnection>}
     */
    async connect({host, port, bindIp = "0.0.0.0", bindPort = 0, bufferLength = chunkSize}) {
        try {
            let handle = new IOTCP();
            let ap = new AsyncProcessor();
            if (!host || !port)
                throw Error("missing host/port");
            handle._connect(bindIp, bindPort, host, port, code => ap.process(code, new TcpConnection(handle, bufferLength)));
            return ap.promise;
        } catch (e) {
            throw new IoError(e.message);
        }
    },
    /**
     * Start listening for incoming TCP/IP connections. Same as creating the {TcpServer} instance.
     *
     * @param {number} port - Port to listen.
     * @param {string} bindIp="0.0.0.0" - Interface to use.
     * @param {number} maxConnections=0 - The maximum number of connections allowed in the queue.
     * @param {number} bufferLength=chunkSize - Buffer length for the TcpConnection streams.
     * @return {TcpServer}
     */
    listen({port, bindIp = "0.0.0.0", maxConnections = 0, bufferLength = chunkSize}) {
        return new TcpServer({port, bindIp, maxConnections, bufferLength});
    }
};

/**
 * The TLS connection class. Includes {#input} and {#output} streams.
 */
class TLSConnection {

    constructor(handle, bufferLength = chunkSize) {
        this._handle = handle;
        /**
         * Input stream associated with the connection.
         * @type {InputStream}
         */
        this.input = new InputStream(handle, bufferLength);
        /**
         * Output stream associated with the connection.
         * @type {OutputStream}
         */
        this.output = new OutputStream(handle, bufferLength);
    }

    /**
     * Close the connection.
     * @async
     * @returns {Promise<void>}
     */
    async close() {
        return this._handle.close();
    }

}

/**
 * TLS server processes incoming connection using {accept} method.
 */
class TLSServer {
    /**
     * Construct server to listen for the incoming TLS connection on the specified port.
     *
     * Important note. The server actually will not start listening until the {accept()} call.
     *
     * @param {number} port to listen.
     * @param {string} bindIp="0.0.0.0" - IP address for bind socket.
     * @param {number} maxConnections=0 - The maximum number of connections allowed in the queue.
     * @param {number} bufferLength=chunkSize - Buffer length for the TLSConnection streams.
     * @param {string} certFilePath - Path to PEM file with certificate.
     * @param {string} keyFilePath - Path to PEM file with key.
     * @param {number} timeout=5000 - Waiting (in milliseconds) for a TLS handshake before calling a callback with an error
     *        and auto close socket. Set to 0 for endless waiting.
     */
    constructor({port, bindIp = "0.0.0.0", certFilePath, keyFilePath, maxConnections = 0, bufferLength = chunkSize, timeout = 5000}) {
        [this.port, this.bindIp, this.certFilePath, this.keyFilePath, this.maxConnections, this.bufferLength, this.timeout] =
            [port, bindIp, certFilePath, keyFilePath, maxConnections, bufferLength, timeout];
    }

    /**
     * Accept incoming connection. Calls resolve(TLSConnection) on each incoming connection or
     * reject(error) if it is not possible.
     *
     * @param {function} resolve - Callback to process incoming connection passed as a single argument of type {TLSConnection}
     * @param {function} reject - Callback to process errors. After it is called, the server may stop processing incoming connections.
     */
    accept(resolve, reject) {
        this.handle = new IOTLS();
        this.handle._listen(this.bindIp, this.port, this.certFilePath, this.keyFilePath, (code) => {
            if (code < 0)
                reject(new IoError(code));
            else {
                try {
                    let connectionHandle = new IOTLS();
                    let ap = new AsyncProcessor();
                    ap.resolve = resolve;
                    ap.reject = reject;
                    connectionHandle._accept(this.handle, code => ap.process(code, new TLSConnection(connectionHandle, this.bufferLength)), this.timeout);
                } catch (e) {
                    reject(e);
                }
            }
        }, this.maxConnections);
    }

    /**
     * Stop listening for incoming connections.
     * @async
     * @return {Promise<*>}
     */
    async close() {
        return this.handle.close();
    }
}

/**
 * @namespace
 */
let tls = {
    /**
     * Asynchronous init, bind and establish an TLC connection.
     *
     * @async
     * @param {string} host - IP address of remote socket (IPv4 or IPv6).
     * @param {number} port - Port of remote socket.
     * @param {string} bindIp="0.0.0.0" - IP address for bind socket (IPv4 or IPv6).
     * @param {number} bindPort - Port for bind socket.
     * @param {string} certFilePath - Path to PEM file with certificate.
     * @param {string} keyFilePath - Path to PEM file with key.
     * @param {number} bufferLength=chunkSize - Buffer length for the TLSConnection streams.
     * @param {number} timeout=5000 - Waiting (in milliseconds) for a TLS handshake before calling a callback with an error
     *        and auto close socket. Set to 0 for endless waiting.
     * @return {Promise<TLSConnection>}
     */
    async connect({host, port, bindIp = "0.0.0.0", bindPort = 0, certFilePath, keyFilePath, bufferLength = chunkSize, timeout = 5000}) {
        try {
            let handle = new IOTLS();
            let ap = new AsyncProcessor();
            if (!host || !port)
                throw Error("missing host/port");
            if (!certFilePath || !keyFilePath)
                throw Error("missing certFilePath/keyFilePath");
            handle._connect(bindIp, bindPort, host, port, certFilePath, keyFilePath, code => ap.process(code, new TLSConnection(handle, bufferLength)), timeout);
            return ap.promise;
        } catch (e) {
            throw new IoError(e.message);
        }
    },
    /**
     * Start listening for incoming TLS connections. Same as creating the {TLSServer} instance.
     *
     * @param {number} port - Port to listen.
     * @param {string} bindIp="0.0.0.0" - Interface to use.
     * @param {string} certFilePath - Path to PEM file with certificate.
     * @param {string} keyFilePath - Path to PEM file with key.
     * @param {number} maxConnections=0 - The maximum number of connections allowed in the queue.
     * @param {number} bufferLength=chunkSize - Buffer length for the TLSConnection streams.
     * @return {TLSServer}
     */
    listen({port, bindIp = "0.0.0.0", certFilePath, keyFilePath, maxConnections = 0, bufferLength = chunkSize}) {
        return new TLSServer({port, bindIp, certFilePath, keyFilePath, maxConnections, bufferLength});
    }
};

/**
 * The UDP socket class.
 */
class UdpSocket {

    constructor(handle) {
        this._handle = handle;
    }

    /**
     * Asynchronous send data to UDP socket.
     *
     * @async
     * @param data - Data that is sent to the socket.
     * @param {number} port - Port of remote socket.
     * @param {string} IP="0.0.0.0" - IP address of remote socket (IPv4 or IPv6).
     * @return {Promise<void>}
     */
    async send(data, {port, IP = "0.0.0.0"}) {
        if (typeof(data) == 'string')
            data = utf8Encode(data);

        if (!(data instanceof Uint8Array))
            data = Uint8Array.from(data);

        let ap = new AsyncProcessor();
        this._handle._send(data, IP, port, code => ap.process(code));
        return ap.promise;
    }

    /**
     * Asynchronous receive data from UDP socket.
     * Callback of this method can be called multiple times, each time data is received,
     * until the method IOUDP::stopRecv is called.
     *
     * @param {number} size - Maximum number of bytes to receive from socket.
     * @param {function} resolve - Callback to process usage opened UDP socket.
     * @param {function} reject - Callback to process errors.
     */
    recv(size, resolve, reject) {
        if (size <= 0)
            throw Error("size must > 0");
        this._handle._recv((data, code, IP, port) => {
            if (code < 0)
                reject(new IoError(code));
            else {
                // recv less than expected: slice
                if( code > 0 && code < size )
                    data = data.slice(0, code);

                resolve(utf8Decode(data), IP, port);
            }
        });
    }

    /**
     * Stop receiving data from the socket
     */
    stopRecv() {
        this._handle._stop_recv();
    }

    /**
     * Close the socket
     * @async
     * @returns {Promise<void>}
     */
    async close() {
        return this._handle.close();
    }
}

/**
 * @namespace
 */
let udp = {
    /**
     * Open and bind UDP socket.
     *
     * @param {number} port - Port for binding UDP socket.
     * @param {string} IP - IP address for binding UDP socket.
     * @param {function} resolve - Callback to process usage opened UDP socket.
     * @param {function} reject - Callback to process errors.
     * @return {UdpSocket}
     */
    open({port, IP = "0.0.0.0"}, reject) {
        try {
            let handle = new IOUDP();

            let result = handle._open(IP, port);
            if (result < 0) {
                reject(new IoError(result));
                return null;
            }
            else
                return new UdpSocket(handle);
        } catch (e) {
            throw new IoError(e.message);
        }
    }
};

module.exports = {tcp, TcpServer, tls, TLSServer, udp, UdpSocket};