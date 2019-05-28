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
        this.log = logger;
        this.nodeKey = privateKey;
        this.cache = null;
        this.parcelCache = null;
        this.envCache = null;
        this.config = null;
        this.localCors = false;

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

            console.log("/environments " + encodedString);

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

        return {U: Config.rate[NSmartContract.SmartContractType.UNS1].toFixed()}
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

    approve(params, sessionKey) {
        this.checkNode(sessionKey);

        if (this.config.limitFreeRegistrations() &&
            (!(
                Config.networkAdminKeyAddress.match(sessionKey) ||
                this.config.keysWhiteList.some(key => key.equals(sessionKey)) ||
                this.config.addressesWhiteList.some(addr => addr.match(sessionKey))
            ))) {

            let contract = null;
            try {
                contract = Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem"));
            } catch (err) {
                console.log("approve ERROR: " + err.message);
                return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)}
            }

            if (contract == null || !contract.isUnlimitKeyContract(config)) {
                if (contract.errors.length > 0) {
                    contract.errors.forEach(err => console.log(err.message));
                    return {itemResult : this.itemResultOfError(Errors.FAILED_CHECK,"approve", contract.errors[contract.errors.length - 1].message)};
                } else {
                    console.log("approve ERROR: command needs client key from whitelist");
                    return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY,"approve", "command needs client key from whitelist")};
                }
            }
        }

        try {
            return {itemResult : this.node.registerItem(Contract.fromPackedTransaction(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            console.log("approve ERROR: " + err.message);
            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approve", err.message)};
        }
    }

    approveParcel(params, sessionKey) {
        this.checkNode(sessionKey);

        try {
            return {result : this.node.registerParcel(Parcel.unpack(t.getOrThrow(params, "packedItem")))}; //TODO: node
        } catch (err) {
            console.log("approveParcel ERROR: " + err.message);
            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approveParcel", err.message)};
        }
    }

    startApproval(params, session) {
        /*if (this.config === null || this.config.limitFreeRegistrations())
            if(this.config === null || (
                !this.config.keysWhiteList.contains(session.publicKey) &&
                !this.config.addressesWhiteList.stream().anyMatch()addr => addr.isMatchingKey(session.publicKey))) {

                console.log("startApproval ERROR: session key shoild be in the white list");

                return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY,"startApproval", "command needs client key from whitelist")};
            }

        let n = asyncStarts.incrementAndGet();
        let k = new AtomicInteger();
        params.getListOrThrow("packedItems").forEach((item) ->
            es.execute(() -> {
                try {
                    checkNode(session);
                    console.log("Request to start registration #"+n+":"+k.incrementAndGet());

                    this.node.registerItem(Contract.fromPackedTransaction(((Bytes)item).toArray())); //TODO
                } catch (err) {
                    e.printStackTrace();
                }
            })
        );*/

        //TODO: return ItemResult
        return {};
    }

    getState(params, session) {
        this.checkNode(session, true);

        try {
            return {itemResult : this.node.checkItem(params.itemId)}; //TODO
        } catch (err) {
            console.log(err.stack);
            console.log("getState ERROR: " + err.message);

            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"approveParcel", err.message)};
        }

    }

    resyncItem(params, session) {
        this.checkNode(session, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            console.log(err.stack);
        }

        if (this.config.limitFreeRegistrations)

            if(!(
                tmpAddress.isMatchingKey(session.publicKey) ||
                this.config.networkAdminKeyAddress.isMatchingKey(session.publicKey) ||
                this.config.keysWhiteList.contains(session.publicKey) ||
                this.config.addressesWhiteList().stream().anyMatch(addr => addr.isMatchingKey(session.publicKey))
            )) {
                console.log("approve ERROR: command needs client key from whitelist");

                return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY,"resyncItem", "command needs client key from whitelist")};
            }

        try {
            let result = {itemResult : this.node.checkItem(params.itemId)}; //TODO
            this.node.resync(params.itemId);
            return result;
        } catch (err) {
            console.log("getState ERROR: " + err.message);
            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"resyncItem", err.message)};
        }
    }

    setVerbose(params, session) {
        this.checkNode(session, true);

        let tmpAddress = null;
        try {
            tmpAddress = new crypto.KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (err) {
            console.log(err.stack);
        }


        if (this.config.limitFreeRegistrations)
            if(!(tmpAddress.isMatchingKey(session.publicKey) ||
                this.config.networkAdminKeyAddress.isMatchingKey(session.publicKey) ||
                this.config.keysWhiteList.contains(session.publicKey) ||
                this.config.addressesWhiteList.stream().anyMatch(addr => addr.isMatchingKey(session.publicKey))
            )) {
                console.log("approve ERROR: command needs client key from whitelist");

                return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY,"setVerbose", "command needs client key from whitelist")};
            }

        try {
            let nodeLevel = params.node;
            if(nodeLevel != null) {
                if("nothing".equals(nodeLevel)) {
                    this.node.verboseLevel = DatagramAdapter.VerboseLevel.NOTHING;
                } else if("base".equals(nodeLevel)) {
                    this.node.verboseLevel = DatagramAdapter.VerboseLevel.BASE;
                } else if("detail".equals(nodeLevel)) {
                    this.node.verboseLevel = DatagramAdapter.VerboseLevel.DETAILED;
                }
            }

            let networkLevel = params.network;
            if(networkLevel != null) {
                if("nothing".equals(networkLevel)) {
                    this.node.neworkVerboseLevel = DatagramAdapter.VerboseLevel.NOTHING;
                } else if("base".equals(networkLevel)) {
                    this.node.neworkVerboseLevel = DatagramAdapter.VerboseLevel.BASE;
                } else if("detail".equals(networkLevel)) {
                    this.node.neworkVerboseLevel = DatagramAdapter.VerboseLevel.DETAILED;
                }
            }

            let udpLevel = params.udp;
            if(udpLevel != null) {
                if("nothing".equals(udpLevel)) {
                    this.node.UDPVerboseLevel = DatagramAdapter.VerboseLevel.NOTHING;
                } else if("base".equals(udpLevel)) {
                    this.node.UDPVerboseLevel = DatagramAdapter.VerboseLevel.BASE;
                } else if("detail".equals(udpLevel)) {
                    this.node.UDPVerboseLevel = DatagramAdapter.VerboseLevel.DETAILED;
                }
            }
            return Binder.of("itemResult",ItemResult.UNDEFINED);
        } catch (err) {
            console.log("getState ERROR: " + err.message);

            return {itemResult : this.itemResultOfError(Errors.COMMAND_FAILED,"resyncItem", err.message)};
        }
    }

    getStats(params, session) {
        this.checkNode(session, true);

        if (this.config === null || this.node === null || !( //TODO
            this.config.networkAdminKeyAddress.isMatchingKey(session.publicKey) ||
            this.node.myInfo.publicKey.equals(session.publicKey) ||
            this.config.keysWhiteList.contains(session.publicKey) || //TODO
            this.config.addressesWhiteList().stream().anyMatch(addr => addr.isMatchingKey(session.publicKey))
        )) {
            console.log("command needs admin key");
            return {itemResult : this.itemResultOfError(Errors.BAD_CLIENT_KEY,"getStats", "command needs admin key")};
        }
        return this.node.provideStats(t.getOrDefault(params, "showDays", null));
    }

    getParcelProcessingState(params, session) {
        this.checkNode(session, true);

        try {
            return {processingState : this.node.checkParcelProcessingState(params.parcelId)} //TODO
        } catch (err) {
            console.log("getParcelProcessingState ERROR: " + err.message);

            //TODO: return processing state not String
            return {processingState : "getParcelProcessingState ERROR: " + err.message};
        }
    }

    storageGetRate(params, session) {
        this.checkNode(session, true);

        return {U: Config.rate[NSmartContract.SmartContractType.SLOT1].toFixed()}
    }

    querySlotInfo(params, session) {
        this.checkNode(session, true);

        let slot_id = params.slot_id;
        let slotBin = this.node.ledger.getSmartContractById(crypto.HashId.withBase64Digest(slot_id)); //TODO

        if (slotBin !== null) {
            let slotContract =  Contract.fromPackedTransaction(slotBin);
            return {slot_state: slotContract.state.data};
        }
        return {slot_state: null};
    }

    queryContract(params, session) {
        this.checkNode(session, true);

        let res = {};
        res[contract] = null;
        let slot_id = params.slot_id;
        let origin_id = params.origin_id;
        let contract_id = params.contract_id;

        if ((origin_id === null) && (contract_id === null))
            throw new Error("invalid arguments (both origin_id and contract_id are null)");
        if ((origin_id !== null) && (contract_id !== null))
            throw new Error("invalid arguments (only one origin_id or contract_id is allowed)");
        let slotBin = this.node.ledger.getSmartContractById(crypto.HashId.withBase64Digest(slot_id)); //TODO
        if (slotBin != null) {
            let slotContract = Contract.fromPackedTransaction(slotBin);
            if (contract_id !== null) {
                let contractHashId = crypto.HashId.withBase64Digest(contract_id);
                res[contract] = this.node.ledger.getContractInStorage(contractHashId);
            } else if (origin_id != null) {
                let originHashId = crypto.HashId.withBase64Digest(origin_id);
                let storedRevisions = this.node.ledger.getContractsInStorageByOrigin(slotContract.id, originHashId);
                if (storedRevisions.length === 1) {
                    res[contract] = storedRevisions.get(0);
                } else if (storedRevisions.length > 1) {
                    let latestContract = [];
                    let latestRevision = 0;
                    for (let bin of storedRevisions) {
                        let c = Contract.fromPackedTransaction(bin);
                        if (latestRevision < c.revision) {
                            latestRevision = c.revision;
                            latestContract = bin;
                        }
                    }
                    res[contract] = latestContract;
                }
            }
        }
        return res;
    }

    followerGetRate(params, session) {
        this.checkNode(session, true);

        let rateOriginDays = Config.rate[NSmartContract.SmartContractType.FOLLOWER1].toFixed();
        let rateCallback = Config.rate[NSmartContract.SmartContractType.FOLLOWER1 + ":callback"].div.toFixed();

        return {
            rateOriginDays: rateOriginDays,
            rateCallback: rateCallback
        };
    }

    queryFollowerInfo(params, session) {
        this.checkNode(session, true);

        let follower_id = params.follower_id;
        let followerBin = this.node.ledger.getSmartContractById(crypto.HashId.withBase64Digest(follower_id)); //TODO

        if (followerBin !== null) {
            let followerContract =  Contract.fromPackedTransaction(followerBin);
            return {follower_state: followerContract.state.data};
        }
        return {follower_state: null};
    }

}

module.exports = {ClientHTTPServer};