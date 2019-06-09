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
                    data = Boss.dump(nie);
            }

            let nie = await this.node.ledger.getEnvironment(id);
            if (nie != null)
                data = Boss.dump(nie);

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
                result.nodesPacked = Boss.dump(nodes);
                result.signature = await ExtendedSignature.sign(this.nodeKey, Boss.dump(nodes));
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

            let packedData = Boss.dump({
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

        this.addSecureEndpoint("getStats", this.getStats);
        this.addSecureEndpoint("getState", this.getState);
        this.addSecureEndpoint("getParcelProcessingState", this.getParcelProcessingState);
        this.addSecureEndpoint("approve", this.approve);
        this.addSecureEndpoint("resyncItem", this.resyncItem);
        this.addSecureEndpoint("pingNode", this.pingNode);
        this.addSecureEndpoint("setVerbose", this.setVerbose);
        this.addSecureEndpoint("approveParcel", this.approveParcel);
        this.addSecureEndpoint("startApproval", this.startApproval);
        this.addSecureEndpoint("storageGetRate", this.storageGetRate);
        this.addSecureEndpoint("querySlotInfo", this.querySlotInfo);
        this.addSecureEndpoint("queryContract", this.queryContract);
        this.addSecureEndpoint("unsRate", this.unsRate);
        this.addSecureEndpoint("queryNameRecord", this.queryNameRecord);
        this.addSecureEndpoint("queryNameContract", this.queryNameContract);
        this.addSecureEndpoint("getBody", this.getBody);
        this.addSecureEndpoint("getContract", this.getContract);
        this.addSecureEndpoint("followerGetRate", this.followerGetRate);
        this.addSecureEndpoint("queryFollowerInfo", this.queryFollowerInfo);
        this.addSecureEndpoint("proxy", this.proxy);

        super.startServer();
    }

    shutdown() {
        super.stopServer();
    }

    checkNode(sessionKey, checkKeyLimit = false) {
        // checking node
        if (this.node == null)
            throw new ex.CommandFailedError(Errors.NOT_READY, "please call again after a while");

        if (this.node.isSanitating) {   //TODO: node
            //WHILE NODE IS SANITATING IT COMMUNICATES WITH THE OTHER NODES ONLY
            if (this.netConfig.toList().some(nodeInfo => nodeInfo.publicKey.equals(sessionKey)))
                return;

            throw new ex.CommandFailedError(Errors.NOT_READY, "please call again after a while");
        }

        // checking key limit
        if (checkKeyLimit && !this.node.checkKeyLimit(sessionKey))   //TODO: node
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

    unsRate(params, sessionKey) {
        this.checkNode(sessionKey, true);

        return {U: Config.rate[NSmartContract.SmartContractType.UNS1].toFixed()};
    }

    async queryNameRecord(params, sessionKey) {
        this.checkNode(sessionKey, true);

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

    async queryNameContract(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let nr = await this.node.ledger.getNameRecord(t.getOrThrow(params, "name"));
        if (nr != null) {
            let env = await this.node.ledger.getEnvironment(nr.environmentId);
            if (env != null)
                return {packedContract: env.contract.getPackedTransaction()};
        }

        return {};
    }

    async getBody(params, sessionKey) {
        this.checkNode(sessionKey, true);

        if (!this.config.permanetMode)
            return {};

        let itemId = params.itemId;

        let body = await this.node.ledger.getKeptItem(itemId);
        if (body != null)
            return {packedContract: body};

        await this.node.resync(itemId);                       //TODO: node
        let itemResult = await this.node.checkItem(itemId);   //TODO: node

        if (itemResult.state === ItemState.UNDEFINED)
            return {};

        let item = await this.node.getKeptItemFromNetwork(itemId); //TODO: node
        if (item == null)
            return {};

        if (item instanceof Contract && item.id.equals(itemId) && HashId.of(item.sealedBinary).equals(itemId)) {
            let record = await this.node.ledger.getRecord(itemId);
            await this.node.ledger.putKeptItem(record, item);

            return {packedContract: item.getPackedTransaction()};
        }

        return {};
    }

    async getContract(params, sessionKey) {
        this.checkNode(sessionKey, true);

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

    itemResultOfError(error, object, message) {
        let itemResult = ItemResult.from(ItemState.UNDEFINED, false, Date.now(), Date.now());
        itemResult.errors = [new ErrorRecord(error, object, message)];
        return itemResult;
    }

    async approve(params, sessionKey) {
        this.checkNode(sessionKey);

        if (this.config.limitFreeRegistrations() && !(
            Config.networkAdminKeyAddress.match(sessionKey) ||
            this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(sessionKey))))
        {
            let contract = null;
            try {
                contract = Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem"));
            } catch (err) {
                this.logger.log("approve ERROR: " + err.message);
                return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)};
            }

            if (contract == null || !contract.isUnlimitKeyContract(config)) {
                if (contract.errors.length > 0) {
                    contract.errors.forEach(err => this.logger.log(err.message));
                    return {itemResult : this.itemResultOfError(Errors.FAILED_CHECK, "approve", contract.errors[contract.errors.length - 1].message)};
                } else {
                    this.logger.log("approve ERROR: command needs client key from whitelist");
                    return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY, "approve", "command needs client key from whitelist")};
                }
            }
        }

        try {
            return {itemResult : await this.node.registerItem(Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            this.logger.log("approve ERROR: " + err.message);
            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)};
        }
    }

    async approveParcel(params, sessionKey) {
        this.checkNode(sessionKey);

        try {
            return {result : await this.node.registerParcel(Parcel.unpack(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            this.logger.log("approveParcel ERROR: " + err.message);
            return {result : this.itemResultOfError(Errors.COMMAND_FAILED,"approveParcel", err.message)};
        }
    }

    async startApproval(params, sessionKey) {
        if (this.config == null || (this.config.limitFreeRegistrations() &&
            (!this.config.keysWhiteList.some(key => key.equals(sessionKey)) &&
             !this.config.addressesWhiteList.some(addr => addr.match(sessionKey)))))
        {
            this.logger.log("startApproval ERROR: session key should be in the white list");
            return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY, "startApproval", "command needs client key from whitelist")};
        }

        let k = 0;
        let results = [];
        await Promise.all(t.getOrThrow(params, "packedItems").map(async(item) => {
            try {
                this.checkNode(sessionKey);
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

    async getState(params, sessionKey) {
        this.checkNode(sessionKey, true);

        try {
            return {itemResult : await this.node.checkItem(params.itemId)}; //TODO: node
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("getState ERROR: " + err.message);

            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED, "approveParcel", err.message)};
        }
    }

    async resyncItem(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("resyncItem ERROR: " + err.message);
        }

        if (this.config.limitFreeRegistrations && !(
            tmpAddress.match(sessionKey) ||
            Config.networkAdminKeyAddress.match(sessionKey) ||
            this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(sessionKey))))
        {
            this.logger.log("resyncItem ERROR: command needs client key from whitelist");
            return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY, "resyncItem", "command needs client key from whitelist")};
        }

        try {
            let result = {itemResult : await this.node.checkItem(params.itemId)}; //TODO: node
            await this.node.resync(params.itemId);
            return result;
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("resyncItem ERROR: " + err.message);

            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"resyncItem", err.message)};
        }
    }

    async pingNode(params, sessionKey) {
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

        if (!(tmpAddress.match(sessionKey) ||
            Config.networkAdminKeyAddress.match(sessionKey) ||
            this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(sessionKey))))
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

    setVerbose(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("setVerbose ERROR: " + err.message);
        }

        if (this.config.limitFreeRegistrations && !(
            tmpAddress.match(sessionKey) ||
            Config.networkAdminKeyAddress.match(sessionKey) ||
            this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(sessionKey))))
        {
            this.logger.log("setVerbose ERROR: command needs client key from whitelist");
            return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY, "setVerbose", "command needs client key from whitelist")};
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

            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED, "setVerbose", err.message)};
        }
    }

    getStats(params, sessionKey) {
        this.checkNode(sessionKey, true);

        if (this.config == null || this.node == null || !(
            Config.networkAdminKeyAddress.match(sessionKey) ||
            this.node.myInfo.publicKey.equals(sessionKey) ||
            this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
            this.config.addressesWhiteList.some(addr => addr.match(sessionKey))))
        {
            this.logger.log("command needs admin key");
            return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY, "getStats", "command needs admin key")};
        }

        return this.node.provideStats(t.getOrDefault(params, "showDays", null)); //TODO: node
    }

    getParcelProcessingState(params, sessionKey) {
        this.checkNode(sessionKey, true);

        try {
            return {processingState : this.node.checkParcelProcessingState(params.parcelId)}; //TODO: node
        } catch (err) {
            this.logger.log("getParcelProcessingState ERROR: " + err.message);

            //TODO: return processing state not String
            return {processingState : "getParcelProcessingState ERROR: " + err.message};
        }
    }

    storageGetRate(params, sessionKey) {
        this.checkNode(sessionKey, true);

        return {U: Config.rate[NSmartContract.SmartContractType.SLOT1].toFixed()};
    }

    async querySlotInfo(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let slot_id = t.getOrThrow(params, "slot_id");
        let slotBin = await this.node.ledger.getSmartContractById(crypto.HashId.withDigest(slot_id));

        if (slotBin != null) {
            let slotContract = Contract.fromPackedTransaction(slotBin);
            return {slot_state: slotContract.state.data};
        }

        return {slot_state: null};
    }

    async queryContract(params, sessionKey) {
        this.checkNode(sessionKey, true);

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

    followerGetRate(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let rateOriginDays = Config.rate[NSmartContract.SmartContractType.FOLLOWER1];
        let rateCallback = Config.rate[NSmartContract.SmartContractType.FOLLOWER1 + ":callback"].div(rateOriginDays);

        return {
            rateOriginDays: rateOriginDays.toFixed(),
            rateCallback: rateCallback.toFixed()
        };
    }

    async queryFollowerInfo(params, sessionKey) {
        this.checkNode(sessionKey, true);

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

    proxy(params, sessionKey) {
        this.checkNode(sessionKey, true);

        let url = t.getOrThrow(params, "url");

        if (this.getValidUrlsForProxy().has(url)) {
            let command = t.getOrThrow(params, "command");
            let commandParams = t.getOrThrow(params, "params");

            if (command === "command") {
                let err = {response: "Access denied. Command 'command' is not allowed with 'proxy', use 'proxyCommand' instead."};
                return {
                    responseCode: 403,
                    result: Boss.dump({result: "error", response: err})
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
                result: Boss.dump({result: "error", response: err})
            };
        }
    }
}

module.exports = {ClientHTTPServer};