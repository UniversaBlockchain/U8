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
         * Output stream associated with the connection
         * @type {OutputStream}
         */
        this.output = new OutputStream(handle, bufferLength);
    }

    /**
     * Close the connection
     * @returns {Promise<void>}
     */
    async close() {
        this._handle.close();
    }

}

const chunkSize = 1024;

/**
 * TCP server processes incoming connection using {accept} method.
 */
class TcpServer {
    /**
     * Construct server to listen for the imcoming TCP/IP connection on the specified port and interface.
     *
     * Important note. The server actually will not start listening until the {accept()} call.
     *
     * @param port to listen
     * @param bindIp interface to bind to
     * @param maxConnections allowed in the queue
     * @param bufferLength the biffering parameter for the TcpConnection streams.
     */
    constructor({port, bindIp = "0.0.0.0", maxConnections = 0, bufferLength = chunkSize}) {
        [this.port, this.bindIp, this.maxConnections, this.bufferLength] = [port, bindIp, maxConnections, bufferLength];
    }

    /**
     * Accept incoming connection. Calls resolve(TcpConnection) on each incoming connection or
     * reject(error) if it is not possible.
     *
     * @param resolve callback to process incoming connection passed as a single argument of type {TcpConnection}
     * @param reject callback to process errors. After it is called, the server may stop processing incoming connections.
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
     * @return {Promise<*>}
     */
    async close() {
        return this.handle.close();
    }
}

let tcp = {
    /**
     *
     * @param port to listen
     * @param bindIp interface to use
     * @param bufferLength of the stream
     * @returns {Promise<TcpConnection>}
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
     * @param port
     * @param bindIp
     * @param maxConnections
     * @param bufferLength
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
         * Output stream associated with the connection
         * @type {OutputStream}
         */
        this.output = new OutputStream(handle, bufferLength);
    }

    /**
     * Close the connection
     * @returns {Promise<void>}
     */
    async close() {
        this._handle.close();
    }

}

/**
 * TLS server processes incoming connection using {accept} method.
 */
class TLSServer {
    /**
     * Construct server to listen for the imcoming TLS connection on the specified port and interface.
     *
     * Important note. The server actually will not start listening until the {accept()} call.
     *
     * @param port to listen
     * @param bindIp interface to bind to
     * @param maxConnections allowed in the queue
     * @param bufferLength the biffering parameter for the TLSConnection streams.
     * @param certFilePath certFilePath is path to PEM file with certificate.
     * @param keyFilePath is path to PEM file with key.
     */
    constructor({port, bindIp = "0.0.0.0", certFilePath, keyFilePath, maxConnections = 0, bufferLength = chunkSize, timeout = 5000}) {
        [this.port, this.bindIp, this.certFilePath, this.keyFilePath, this.maxConnections, this.bufferLength, this.timeout] =
            [port, bindIp, certFilePath, keyFilePath, maxConnections, bufferLength, timeout];
    }

    /**
     * Accept incoming connection. Calls resolve(TLSConnection) on each incoming connection or
     * reject(error) if it is not possible.
     *
     * @param resolve callback to process incoming connection passed as a single argument of type {TLSConnection}
     * @param reject callback to process errors. After it is called, the server may stop processing incoming connections.
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
     * @return {Promise<*>}
     */
    async close() {
        return this.handle.close();
    }
}

let tls = {
    /**
     *
     * @param port to listen
     * @param bindIp interface to use
     * @param bindPort
     * @param certFilePath certFilePath is path to PEM file with certificate.
     * @param keyFilePath is path to PEM file with key.
     * @param bufferLength of the stream
     * @param timeout (in milliseconds) waiting for a TLS handshake before calling a callback with an error
     * @returns {Promise<TLSConnection>}
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
     * @param port
     * @param bindIp
     * @param certFilePath certFilePath is path to PEM file with certificate.
     * @param keyFilePath is path to PEM file with key.
     * @param maxConnections
     * @param bufferLength
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

    async send(data, {port, IP = "0.0.0.0"}) {
        if (typeof(data) == 'string')
            data = utf8Encode(data);

        if (!(data instanceof Uint8Array))
            data = Uint8Array.from(data);

        let ap = new AsyncProcessor();
        this._handle._send(data, IP, port, code => ap.process(code));
        return ap.promise;
    }

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
     * @returns {Promise<void>}
     */
    async close() {
        this._handle.close();
    }
}

let udp = {

    /**
     * Open and bind UDP socket.
     *
     * @param port for binding UDP socket
     * @param IP address for binding UDP socket
     * @param resolve callback to process usage opened UDP socket
     * @param reject callback to process errors
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

module.exports = {tcp, TcpServer, tls, TLSServer, udp, UdpSocket}