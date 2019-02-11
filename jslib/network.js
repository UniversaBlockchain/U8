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
         * Outpu stream associated with the connection
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
        [this.port, this.bindIp, this.bufferLength, this.maxConnections] = [port, bindIp, maxConnections, bufferLength];
    }

    /**
     * Accept incomint connection. Calls resolve(TcpConnection) on each incoming connection or
     * reject(error) if it is not possible.
     *
     * @param resolve callback to process incoming connection passed as a single argument of type {TcpConnection}
     * @param reject callback to process errors. After it is called, the server may stop processing incoming connections.
     */
    accept(resolve, reject) {
        this.handle = new IoHandle();
        this.handle._listen(this.bindIp, this.port, (code) => {
            if (code < 0)
                reject(new IoError(code));
            else {
                try {
                    let connectionHandle = new IoHandle();
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
            let handle = new IoHandle();
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

module.exports = {tcp, TcpServer}