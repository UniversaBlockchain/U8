import * as network from "web";

const NODE_VERSION = VERSION;
const Boss = require("boss");
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const Config = require("config").Config;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const NNameRecord = require("services/NNameRecord").NNameRecord;
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const ex = require("exceptions");
const t = require("tools");
const Contract = require("contract").Contract;
const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;

class ClientHTTPServer extends network.HttpServer {

    constructor(privateKey, port, logger) {
        super("0.0.0.0", port, 32, 4096);
        this.node = null;
        this.logger = logger;
        this.nodeKey = privateKey;
        this.cache = null;
        this.parcelCache = null;
        this.envCache = null;
        this.config = null;
        this.netConfig = null;
        this.localCors = false;

        this.initSecureProtocol(this.nodeKey);

        this.on("/contracts", async (request) => {
            let encodedString = request.path.substring(11);

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(/ /g, "+");

            let data = null;
            if (encodedString === "cache_test")
                data = utf8Encode("the cache test data");
            else {
                let id = crypto.HashId.withBase64Digest(encodedString);
                if (this.cache != null) {
                    let c = this.cache.get(id);
                    if (c != null)
                        data = c.getPackedTransaction();
                }

                if (data == null)
                    data = await this.node.ledger.getContractInStorage(id);

                if (data == null && this.config.permanetMode)
                    data = await this.node.ledger.getKeptItem(id);
            }

            if (data !== null) {
                // contracts are immutable: cache forever
                request.setHeader("Expires", "Thu, 31 Dec 2037 23:55:55 GMT");
                request.setHeader("Cache-Control", "max-age=315360000");
                request.setAnswerBody(data);
            } else
                request.setStatusCode(404);
        });

        this.on("/parcels", async (request) => {
            let encodedString = request.path.substring(9);

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(/ /g, "+");

            let data = null;
            if (encodedString === "cache_test")
                data = utf8Encode("the cache test data");
            else {
                let id = crypto.HashId.withBase64Digest(encodedString);
                if (this.parcelCache != null) {
                    let p = this.parcelCache.get(id);
                    if (p != null)
                        data = p.pack();
                }
            }

            if (data != null) {
                // contracts are immutable: cache forever
                request.setHeader("Expires", "Thu, 31 Dec 2037 23:55:55 GMT");
                request.setHeader("Cache-Control", "max-age=315360000");
                request.setAnswerBody(data);
            } else
                request.setStatusCode(404);
        });

        this.on("/environments", async (request) => {
            let encodedString = request.path.substring(14);

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(/ /g, "+");

            let id = crypto.HashId.withBase64Digest(encodedString);

            let data = null;
            //TODO: implement envCache
            if (this.envCache != null) {
                let nie = this.envCache.get(id);
                if (nie != null)
                    data = await Boss.dump(nie);
            }

            let nie = await this.node.ledger.getEnvironment(id);
            if (nie != null)
                data = await Boss.dump(nie);

            if (data != null) {
                // contracts are immutable: cache forever
                request.setHeader("Expires", "Thu, 31 Dec 2037 23:55:55 GMT");
                request.setHeader("Cache-Control", "max-age=315360000");
                request.setAnswerBody(data);
            } else
                request.setStatusCode(404);
        });

        this.addEndpoint("/network", async (request) => {
            let nodes = [];

            if (this.netConfig != null)
                this.netConfig.toList().forEach(node => {
                    nodes.push({
                        url: node.publicUrlString(),
                        key: node.publicKey.packed,
                        number: node.number
                    });
                });

            let result = {
                version: NODE_VERSION,
                number: this.node.number,
                nodes: nodes
            };

            if (request.queryParamsMap.get("sign")) {
                result.nodesPacked = await Boss.dump(nodes);
                result.signature = await ExtendedSignature.sign(this.nodeKey, await Boss.dump(nodes));
                delete result.nodes;
            }

            return result;
        });

        this.addEndpoint("/topology", async (request) => {
            let nodes = [];

            if (this.netConfig != null)
                this.netConfig.toList().forEach(node => {
                    let directUrls = [];
                    let domainUrls = [];
                    directUrls.push(node.directUrlStringV4());
                    domainUrls.push(node.domainUrlStringV4());

                    nodes.push({
                        number: node.number,
                        key: node.publicKey.packed,
                        name: node.name,
                        direct_urls: directUrls,
                        domain_urls: domainUrls
                    });
                });

            let packedData = await Boss.dump({
                version: NODE_VERSION,
                number: this.node.number,
                nodes: nodes
            });
            let signature = await ExtendedSignature.sign(this.nodeKey, packedData);

            return {
                packed_data: packedData,
                signature: signature
            };
        });

        this.addSecureEndpoint("getStats", (params, clientKey) => this.getStats(params, clientKey));
        this.addSecureEndpoint("getState", (params, clientKey) => this.getState(params, clientKey));
        this.addSecureEndpoint("getParcelProcessingState", (params, clientKey) => this.getParcelProcessingState(params, clientKey));
        this.addSecureEndpoint("approve", (params, clientKey) => this.approve(params, clientKey));
        this.addSecureEndpoint("resyncItem", (params, clientKey) => this.resyncItem(params, clientKey));
        this.addSecureEndpoint("pingNode", (params, clientKey) => this.pingNode(params, clientKey));
        this.addSecureEndpoint("setVerbose", (params, clientKey) => this.setVerbose(params, clientKey));
        this.addSecureEndpoint("approveParcel", (params, clientKey) => this.approveParcel(params, clientKey));
        this.addSecureEndpoint("startApproval", (params, clientKey) => this.startApproval(params, clientKey));
        this.addSecureEndpoint("storageGetRate", (params, clientKey) => this.storageGetRate(params, clientKey));
        this.addSecureEndpoint("querySlotInfo", (params, clientKey) => this.querySlotInfo(params, clientKey));
        this.addSecureEndpoint("queryContract", (params, clientKey) => this.queryContract(params, clientKey));
        this.addSecureEndpoint("unsRate", (params, clientKey) => this.unsRate(params, clientKey));
        this.addSecureEndpoint("queryNameRecord", (params, clientKey) => this.queryNameRecord(params, clientKey));
        this.addSecureEndpoint("queryNameContract", (params, clientKey) => this.queryNameContract(params, clientKey));
        this.addSecureEndpoint("getBody", (params, clientKey) => this.getBody(params, clientKey));
        this.addSecureEndpoint("getContract", (params, clientKey) => this.getContract(params, clientKey));
        this.addSecureEndpoint("followerGetRate", (params, clientKey) => this.followerGetRate(params, clientKey));
        this.addSecureEndpoint("queryFollowerInfo", (params, clientKey) => this.queryFollowerInfo(params, clientKey));
        this.addSecureEndpoint("proxy", (params, clientKey) => this.proxy(params, clientKey));

        super.startServer();
    }

    async shutdown() {
        await super.stopServer();
    }

    checkNode(clientKey, checkKeyLimit = false) {
        // checking node
        if (this.node == null)
            throw new ex.CommandFailedError(Errors.NOT_READY, "please call again after a while");

        if (this.node.isSanitating()) {
            //WHILE NODE IS SANITATING IT COMMUNICATES WITH THE OTHER NODES ONLY
            if (this.netConfig.toList().some(nodeInfo => nodeInfo.publicKey.equals(clientKey)))
                return;

            throw new ex.CommandFailedError(Errors.NOT_READY, "please call again after a while");
        }

        // checking key limit
        if (checkKeyLimit && !this.node.checkKeyLimit(clientKey))
            throw new ex.CommandFailedError(Errors.COMMAND_FAILED, "exceeded the limit of requests for key per minute, please call again after a while");
    }

    on(path, handler) {
        super.addRawEndpoint(path, async (request) => {
            if (this.localCors) {
                request.setHeader("Access-Control-Allow-Origin", "*");
                request.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                request.setHeader("Access-Control-Allow-Headers", "DNT,X-CustomHeader,Keep-Alive,User-Age  nt,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range");
                request.setHeader("Access-Control-Expose-Headers", "DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range");
            }

            await handler(request);
            request.sendAnswer();
        });
    }

    unsRate(params, clientKey) {
        this.checkNode(clientKey, true);

        return {U: Config.rate[NSmartContract.SmartContractType.UNS1].toFixed()};
    }

    async queryNameRecord(params, clientKey) {
        this.checkNode(clientKey, true);

        let loadedNameRecord = null;
        let address = params.address;
        let origin = params.origin;

        if ((address == null && origin == null) || (address != null && origin != null))
            throw new Error("invalid arguments");

        if (address != null)
            loadedNameRecord = await this.node.ledger.getNameByAddress(address);
        else
            loadedNameRecord = await this.node.ledger.getNameByOrigin(origin);

        if (loadedNameRecord == null)
            return {};

        return {
            name: loadedNameRecord.name,
            description: loadedNameRecord.description,
            url: loadedNameRecord.url
        };
    }

    async queryNameContract(params, clientKey) {
        this.checkNode(clientKey, true);

        let nr = await this.node.ledger.getNameRecord(t.getOrThrow(params, "name"));
        if (nr != null) {
            let env = await this.node.ledger.getEnvironment(nr.environmentId);
            if (env != null)
                return {packedContract: await env.contract.getPackedTransaction()};
        }

        return {};
    }

    async getBody(params, clientKey) {
        this.checkNode(clientKey, true);

        if (!this.config.permanetMode)
            return {};

        let itemId = params.itemId;

        let body = await this.node.ledger.getKeptItem(itemId);
        if (body != null)
            return {packedContract: body};

        await this.node.resync(itemId);
        let itemResult = await this.node.checkItem(itemId);

        if (itemResult.state === ItemState.UNDEFINED)
            return {};

        let item = await this.node.getKeptItemFromNetwork(itemId); //TODO: node
        if (item == null)
            return {};

        if (item instanceof Contract && item.id.equals(itemId) && HashId.of(item.sealedBinary).equals(itemId)) {
            let record = await this.node.ledger.getRecord(itemId);
            await this.node.ledger.putKeptItem(record, item);

            return {packedContract: await item.getPackedTransaction()};
        }

        return {};
    }

    async getContract(params, clientKey) {
        this.checkNode(clientKey, true);

        let res = {};

        if (!this.config.permanetMode)
            return res;

        if (params.hasOwnProperty("origin") && params.hasOwnProperty("parent") ||
            !params.hasOwnProperty("origin") && !params.hasOwnProperty("parent"))
            throw new ex.IllegalArgumentError("Invalid params. Should contain ether origin or parent");

        let id = null;
        let getBy = null;
        if (params.hasOwnProperty("origin")) {
            id = params.origin;
            if (id != null)
                getBy = "state.origin";
        } else if (params.hasOwnProperty("parent")) {
            id = params.parent;
            if (id != null)
                getBy = "state.parent";
        }

        let limit = t.getOrDefault(params, "limit", this.config.queryContractsLimit);

        if (limit > this.config.queryContractsLimit)
            limit = this.config.queryContractsLimit;
        if (limit < 1)
            limit = 1;

        let offset = t.getOrDefault(params, "offset", 0);
        let sortBy = t.getOrDefault(params,"sortBy", "");
        let sortOrder = t.getOrDefault(params,"sortOrder", "DESC");
        let tags = t.getOrDefault(params,"tags", {});

        let kept = await this.node.ledger.getKeptBy(getBy, id, tags, limit, offset, sortBy, sortOrder); //TODO: ledger.getKeptBy
        if (kept == null)
            return res;
        Object.keys(kept).forEach(key => res[key] = kept[key]);

        if (getBy != null) {
            if (getBy === "state.origin")
                res.origin = id;
            else if (getBy === "state.parent")
                res.parent = id;
        }

        res.limit = limit;
        res.offset = offset;
        res.sortBy = sortBy;
        res.sortOrder = sortOrder;

        return res;
    }

    static itemResultOfError(error, object, message) {
        let itemResult = ItemResult.from(ItemState.UNDEFINED, false, new Date(), new Date());
        itemResult.errors = [new ErrorRecord(error, object, message)];
        return itemResult;
    }

    async approve(params, clientKey) {
        this.checkNode(clientKey);

        if (this.config.limitFreeRegistrations() && !(
            Config.networkAdminKeyAddress.match(clientKey) ||
            this.config.keysWhiteList.some(key => key.equals(clientKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(clientKey))))
        {
            let contract = null;
            try {
                contract = Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem"));
            } catch (err) {
                this.logger.log("approve ERROR: " + err.message);
                return {itemResult : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)};
            }

            if (contract == null || !contract.isUnlimitKeyContract(this.config)) {
                if (contract.errors.length > 0) {
                    contract.errors.forEach(err => this.logger.log(err.message));
                    return {itemResult : ClientHTTPServer.itemResultOfError(Errors.FAILED_CHECK, "approve", contract.errors[contract.errors.length - 1].message)};
                } else {
                    this.logger.log("approve ERROR: command needs client key from whitelist");
                    return {itemResult : ClientHTTPServer.itemResultOfError(Errors.BAD_CLIENT_KEY, "approve", "command needs client key from whitelist")};
                }
            }
        }

        try {
            return {itemResult : await this.node.registerItem(Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            this.logger.log("approve ERROR: " + err.message);
            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)};
        }
    }

    async approveParcel(params, clientKey) {
        this.checkNode(clientKey);

        try {
            return {result : await this.node.registerParcel(Parcel.unpack(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            this.logger.log("approveParcel ERROR: " + err.message);
            return {result : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED,"approveParcel", err.message)};
        }
    }

    async startApproval(params, clientKey) {
        if (this.config == null || (this.config.limitFreeRegistrations() &&
            (!this.config.keysWhiteList.some(key => key.equals(clientKey)) &&
             !this.config.addressesWhiteList.some(addr => addr.match(clientKey)))))
        {
            this.logger.log("startApproval ERROR: session key should be in the white list");
            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.BAD_CLIENT_KEY, "startApproval", "command needs client key from whitelist")};
        }

        let k = 0;
        let results = [];
        await Promise.all(t.getOrThrow(params, "packedItems").map(async(item) => {
            try {
                this.checkNode(clientKey);
                k++;
                this.logger.log("Request to start registration:" + k);

                results.push(await this.node.registerItem(Contract.fromPackedTransaction(item)));  //TODO: node
            } catch (err) {
                this.logger.log(err.stack);
                this.logger.log("startApproval ERROR: " + err.message);
            }
        }));

        return {itemResults: results};
    }

    async getState(params, clientKey) {
        this.checkNode(clientKey, true);

        try {
            return {itemResult : await this.node.checkItem(params.itemId)};
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("getState ERROR: " + err.message);

            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED, "getState", err.message)};
        }
    }

    async resyncItem(params, clientKey) {
        this.checkNode(clientKey, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("resyncItem ERROR: " + err.message);
        }

        if (this.config.limitFreeRegistrations && !(
            tmpAddress.match(clientKey) ||
            Config.networkAdminKeyAddress.match(clientKey) ||
            this.config.keysWhiteList.some(key => key.equals(clientKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(clientKey))))
        {
            this.logger.log("resyncItem ERROR: command needs client key from whitelist");
            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.BAD_CLIENT_KEY, "resyncItem", "command needs client key from whitelist")};
        }

        try {
            let result = {itemResult : await this.node.checkItem(params.itemId)}; //TODO: node
            await this.node.resync(params.itemId);
            return result;
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("resyncItem ERROR: " + err.message);

            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED,"resyncItem", err.message)};
        }
    }

    async pingNode(params, clientKey) {
        // checking node
        if (this.node == null)
            throw new ex.CommandFailedError(Errors.NOT_READY, "please call again after a while");

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("pingNode ERROR: " + err.message);
        }

        if (!(tmpAddress.match(clientKey) ||
            Config.networkAdminKeyAddress.match(clientKey) ||
            this.config.keysWhiteList.some(key => key.equals(clientKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(clientKey))))
                throw new ex.IllegalArgumentError("command needs client key from whitelist");

        let nodeNumber = t.getOrThrow(params, "nodeNumber");
        let timeoutMillis = t.getOrDefault(params, "timeoutMillis", 15000);

        if (this.netConfig.getInfo(nodeNumber) == null)
            throw new ex.IllegalArgumentError("Unknown node " + nodeNumber);

        let responseMillisUDP = await this.node.pingNodeUDP(nodeNumber, timeoutMillis); //TODO: node
        let responseMillisTCP = await this.node.pingNodeTCP(nodeNumber, timeoutMillis); //TODO: node

        return {
            UDP: responseMillisUDP,
            TCP: responseMillisTCP
        };
    }

    setVerbose(params, clientKey) {
        this.checkNode(clientKey, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("setVerbose ERROR: " + err.message);
        }

        if (this.config.limitFreeRegistrations && !(
            tmpAddress.match(clientKey) ||
            Config.networkAdminKeyAddress.match(clientKey) ||
            this.config.keysWhiteList.some(key => key.equals(clientKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(clientKey))))
        {
            this.logger.log("setVerbose ERROR: command needs client key from whitelist");
            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.BAD_CLIENT_KEY, "setVerbose", "command needs client key from whitelist")};
        }

        try {
            if (params.node != null)
                this.node.verboseLevel = params.node;

            if (params.network != null)
                this.network.verboseLevel = params.network;

            if (params.udp != null && this.node.network.adapter != null)
                this.node.network.adapter.verboseLevel = params.udp;

            return {itemResult : ItemResult.UNDEFINED};
        } catch (err) {
            this.logger.log("setVerbose ERROR: " + err.message);

            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.COMMAND_FAILED, "setVerbose", err.message)};
        }
    }

    async getStats(params, clientKey) {
        this.checkNode(clientKey, true);

        if (this.config == null || this.node == null || !(
            Config.networkAdminKeyAddress.match(clientKey) ||
            this.node.myInfo.publicKey.equals(clientKey) ||
            this.config.keysWhiteList.some(key => key.equals(clientKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(clientKey))))
        {
            this.logger.log("command needs admin key");
            return {itemResult : ClientHTTPServer.itemResultOfError(Errors.BAD_CLIENT_KEY, "getStats", "command needs admin key")};
        }

        return await this.node.provideStats(params.showDays);
    }

    async getParcelProcessingState(params, clientKey) {
        this.checkNode(clientKey, true);

        try {
            return {processingState : await this.node.checkParcelProcessingState(params.parcelId)};
        } catch (err) {
            this.logger.log("getParcelProcessingState ERROR: " + err.message);

            //TODO: return processing state not String
            return {processingState : "getParcelProcessingState ERROR: " + err.message};
        }
    }

    storageGetRate(params, clientKey) {
        this.checkNode(clientKey, true);

        return {U: Config.rate[NSmartContract.SmartContractType.SLOT1].toFixed()};
    }

    async querySlotInfo(params, clientKey) {
        this.checkNode(clientKey, true);

        let slot_id = t.getOrThrow(params, "slot_id");
        let slotBin = await this.node.ledger.getSmartContractById(crypto.HashId.withDigest(slot_id));

        if (slotBin != null) {
            let slotContract = Contract.fromPackedTransaction(slotBin);
            return {slot_state: slotContract.state.data};
        }

        return {slot_state: null};
    }

    async queryContract(params, clientKey) {
        this.checkNode(clientKey, true);

        let contract = null;
        let slot_id = params.slot_id;
        let origin_id = params.origin_id;
        let contract_id = params.contract_id;

        if (origin_id == null && contract_id == null)
            throw new Error("invalid arguments (both origin_id and contract_id are null)");

        if (origin_id != null && contract_id != null)
            throw new Error("invalid arguments (only one origin_id or contract_id is allowed)");

        let slotBin = await this.node.ledger.getSmartContractById(crypto.HashId.withDigest(slot_id));
        if (slotBin != null) {
            let slotContract = Contract.fromPackedTransaction(slotBin);
            if (contract_id != null) {
                let contractHashId = crypto.HashId.withDigest(contract_id);
                contract = await this.node.ledger.getContractInStorage(contractHashId);

            } else if (origin_id != null) {
                let originHashId = crypto.HashId.withDigest(origin_id);
                let storedRevisions = await this.node.ledger.getContractsInStorageByOrigin(slotContract.id, originHashId);

                if (storedRevisions.length === 1)
                    contract = storedRevisions[0];
                else if (storedRevisions.length > 1) {
                    let latestRevision = 0;
                    for (let bin of storedRevisions) {
                        let c = Contract.fromPackedTransaction(bin);
                        if (latestRevision < c.state.revision) {
                            latestRevision = c.state.revision;
                            contract = bin;
                        }
                    }
                }
            }
        }

        return {contract: contract};
    }

    followerGetRate(params, clientKey) {
        this.checkNode(clientKey, true);

        let rateOriginDays = Config.rate[NSmartContract.SmartContractType.FOLLOWER1];
        let rateCallback = Config.rate[NSmartContract.SmartContractType.FOLLOWER1 + ":callback"].div(rateOriginDays);

        return {
            rateOriginDays: rateOriginDays.toFixed(),
            rateCallback: rateCallback.toFixed()
        };
    }

    async queryFollowerInfo(params, clientKey) {
        this.checkNode(clientKey, true);

        let follower_id = t.getOrThrow(params, "follower_id");
        let followerBin = await this.node.ledger.getSmartContractById(crypto.HashId.withDigest(follower_id));

        if (followerBin != null) {
            let followerContract = Contract.fromPackedTransaction(followerBin);
            return {follower_state: followerContract.state.data};
        }

        return {follower_state: null};
    }

    getValidUrlsForProxy() {
        let res = new Set();
        if (this.netConfig != null)
            this.netConfig.toList().forEach(node => {
                res.add(node.directUrlStringV4());
                res.add(node.domainUrlStringV4());
            });

        return res;
    }

    async proxy(params, clientKey) {
        this.checkNode(clientKey, true);

        let url = t.getOrThrow(params, "url");

        if (this.getValidUrlsForProxy().has(url)) {
            let command = t.getOrThrow(params, "command");
            let commandParams = t.getOrThrow(params, "params");

            if (command === "command") {
                let err = {response: "Access denied. Command 'command' is not allowed with 'proxy', use 'proxyCommand' instead."};
                return {
                    responseCode: 403,
                    result: await Boss.dump({result: "error", response: err})
                };
            } else {
                //TODO: BasicHttpClient.requestRaw
                let basicHttpClient = new BasicHttpClient(url);
                let answerRaw = basicHttpClient.requestRaw(command, commandParams);

                return {
                    responseCode: answerRaw.code,
                    result: answerRaw.body
                };
            }
        } else {
            let err = {response: "Access denied. Url '" + url + "' is not found in network topology."};
            return {
                responseCode: 403,
                result: await Boss.dump({result: "error", response: err})
            };
        }
    }
}

module.exports = {ClientHTTPServer};