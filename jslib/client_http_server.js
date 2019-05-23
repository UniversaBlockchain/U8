import * as network from "web";

const Main = require("main").Main;
const Boss = require("boss");
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const Config = require("config").Config;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const NNameRecord = require("services/NNameRecord").NNameRecord;
const e = require("errors");
const Errors = e.Errors;
const ex = require("exceptions");

class ClientHTTPServer extends network.HttpServer {

    constructor(privateKey, port, logger) {
        super();
        this.log = logger;
        this.nodeKey = privateKey;
        this.cache = null;
        this.parcelCache = null;
        this.envCache = null;
        this.config = new Config();

        on("/contracts", (request, response) => {
            let encodedString = request.getPath().substring(11); //TODO

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(' ', '+');  // TODO

            let data = [];
            if (encodedString.equals("cache_test")) {
                data = "the cache test data".getBytes();
            } else {
                let id = crypto.HashId.withDigest(encodedString);
                if (this.cache !== null) {
                    let c = this.cache.get(id);
                    if (c != null) {
                        data = c.getPackedTransaction();
                    }
                }
                if (data === null) {
                    data = this.node.ledger.getContractInStorage(id);
                }
                if ((data == null) && this.node.config.isPermanetMode())
                    data = this.node.ledger.getKeepingItem(id);
            }

            if (data !== null) {
                // contracts are immutable: cache forever
                let hh = response.headers;
                hh["Expires"] =  "Thu, 31 Dec 2037 23:55:55 GMT";
                hh["Cache-Control"] = "max-age=315360000";
                response.setBody(data);
            } else
                response.responseCode = "404";
        });

        on("/parcels", (request, response) => {
            let encodedString = request.getPath().substring(9);

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(' ', '+');

            let data = [];
            if (encodedString.equals("cache_test")) {
                data = "the cache test data".getBytes();
            } else {
                let id = crypto.HashId.withDigest(encodedString);
                /*if (this.parcelCache !== null) {              // TODO
                    let p = this.parcelCache.id;
                    if (p != null) {
                        data = p.pack();
                    }
                }*/
            }
            if (data !== null) {
                // contracts are immutable: cache forever
                let hh = response.headers;
                hh["Expires"] = "Thu, 31 Dec 2037 23:55:55 GMT";
                hh["Cache-Control"] = "max-age=315360000";
                response.setBody(data);
            } else
                response.responseCode = "404";
        });

        on("/environments", (request, response) => {
            let encodedString = request.getPath().substring(14);

            // this is a bug - path has '+' decoded as ' '
            encodedString = encodedString.replace(' ', '+');

            console.log("/environments " + encodedString);

            let id = crypto.HashId.withDigest(encodedString);

            let data = [];
            //TODO: implement envCache
            /*if (envCache != null) {
                NImmutableEnvironment nie =  envCache.get(id);
                if (nie != null) {
                    data = Boss.pack(nie);
                }
            }*/

            let nie =  this.node.ledger.getEnvironment(id);

            if (nie !== null) {
                data = Boss.pack(nie);
            }

            if (data != null) {
                // contracts are immutable: cache forever
                let hh = response.headers;
                hh["Expires"] = "Thu, 31 Dec 2037 23:55:55 GMT";
                hh["Cache-Control"] = "max-age=315360000";
                response.setBody(data);
            } else
                response.responseCode = "404";
        });

        this.addEndpoint("/network", (params, result) => {
            if (this.networkData == null) {
                let nodes = [];

                if (this.netConfig != null) {
                    this.netConfig.toList().forEach(node => {
                        nodes.push({
                            url: node.publicUrlString(),
                            key: node.publicKey.packed,
                            number: node.number
                        });
                    });
                }

                result.version = Main.NODE_VERSION;
                result.number = this.node.number;
                result.nodes = nodes;

                if (params.sign === true) {
                    result.nodesPacked = Boss.dump(nodes);
                    result.signature = ExtendedSignature.sign(this.nodeKey, Boss.dump(nodes));
                    delete result.nodes;
                }
            }
        });

        //TODO: to be removed in near future
        this.addEndpoint("netsigned", (params, result) => {
            if (this.networkData == null) {
                let nodes = [];

                if (this.netConfig != null) {
                    this.netConfig.toList().forEach(node => {
                        nodes.push({
                            url: node.publicUrlString(),
                            key: node.publicKey.packed,
                            number: node.number,
                            IP: node.serverHost,
                            ipurl: node.publicUrlString()
                        });
                    });
                }

                result.version = Main.NODE_VERSION;
                result.number = this.node.getNumber();
                result.nodesPacked = Boss.dump(nodes);
                result.signature = ExtendedSignature.sign(this.nodeKey, Boss.dump(nodes));
                delete result.nodes;
            }
        });

        this.addEndpoint("/topology", (params, result) => {
            if (this.networkData == null) {
                let res = [];
                let nodes = [];
                res.putAll(
                    "version", Main.NODE_VERSION,
                    "number", node.getNumber(),
                    "nodes", nodes
                );

                if (this.netConfig != null) {
                    this.netConfig.toList().forEach(node => {
                        let directUrls = [];
                        let domainUrls = [];
                        directUrls.push(node.directUrlStringV4());
                        domainUrls.push(node.domainUrlStringV4());

                        nodes.push({
                            number: node.number,
                            key: node.publicKey.packed,
                            name: node.getName(),
                            direct_urls: directUrls,
                            domain_urls: domainUrls
                        });
                    });
                }

                let packedData = Boss.dump(res);
                let signature = ExtendedSignature.sign(nodeKey,packedData);
                result.packed_data = packedData;
                result.signature = signature;
            }
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

    }

    shutdown() {
        this.es.shutdown();
        this.node.shutdown();
        super.shutdown();
    }

    unsRate(params, session) {
        this.checkNode(session, true);

        return {U: Config.rate[NSmartContract.SmartContractType.UNS1].toFixed()}
    }

    queryNameRecord(params, session) {
        this.checkNode(session, true);

        let b = {};
        let loadedNameRecord = new NNameRecord();
        let address = params.getString("address",null);
        let origin = params.getBinary("origin");

        if (((address === null) && (origin === null)) || ((address !== null) && (origin !== null)))
            throw new Error("invalid arguments"); //TODO

        if (address != null)
            loadedNameRecord = this.node.ledger.getNameByAddress(address);
        else
            loadedNameRecord = this.node.ledger.getNameByOrigin(origin);

        if (loadedNameRecord !== null) {
            b["name"] = loadedNameRecord.name;
            b["description"] = loadedNameRecord.description;
            b["url"] = loadedNameRecord.url;
        }
        return b;
    }

    queryNameContract(params, session) {
        this.checkNode(session, true);

        let b = {};
        let nameContract = params.getStringOrThrow("name");
        let nr = this.node.ledger.getNameRecord(nameContract);
        if (nr !== null) {
            let env = node.ledger.getEnvironment(nr.getEnvironmentId());
            if (env !== null) {
                let packedContract = env.getContract().getPackedTransaction();
                b["packedContract"] =  packedContract;
            }
        }
        return b;
    }

    getBody(params, session) {
        this.checkNode(session, true);

        let res = {};

        if (!this.node.config.isPermanetMode())
            return res;

        let itemId = params.itemId;

        let body = this.node.ledger.getKeepingItem(itemId);
        if (body !== null) {
            res["packedContract"] = body;
            return res;
        }

        this.node.resync(itemId);
        let itemResult = this.node.checkItem(itemId);

        if (itemResult.state == ItemState.UNDEFINED)
            return res;

        let item = this.node.getKeepingItemFromNetwork(itemId);
        if (item == null)
            return res;

        if ((item instanceof Contract) && //TODO
            (item.id.equals(itemId)) &&
            (HashId.of(item.getLastSealedBinary()).equals(itemId))) {
            let record = node.ledger.getRecord(itemId);
            this.node.ledger.putKeepingItem(record, item);

            res["packedContract"] = item.getPackedTransaction();
        }

        return res;
    }

    getContract(params, session) {
        this.checkNode(session, true);

        let res = {};

        if (!this.node.config.isPermanetMode())
            return res;

        if(params.has("origin") && params.has("parent") || !params.has("origin") && !params.has("parent")) { //TODO
            throw new ex.IllegalArgumentError("Invalid params. Should contain ether origin or parent");
        }

        let id = new crypto.HashId();
        let getBy = "";
        if(params.has("origin")) {
            id = params.origin;
            if(id != null)
                getBy = "state.origin";
        }

        if(params.has("parent")) {
            id = params.parent;
            if(id != null)
                getBy = "state.parent";
        }

        let limit = params.getInt("limit", this.node.config.queryContractsLimit);

        if (limit > this.node.config.queryContractsLimit)
            limit = this.node.config.queryContractsLimit;
        if (limit < 1)
            limit = 1;

        let offset = params.getInt("offset", 0);

        let sortBy = params.getString("sortBy", "");
        let sortOrder = params.getString("sortOrder", "DESC");

        let tags = params.getBinder("tags");

        let keeping = this.node.ledger.getKeepingBy(getBy,id, tags, limit, offset,sortBy,sortOrder); //TODO
        if (keeping === null)
            return res;
        res.putAll(keeping); //TODO

        if(getBy !== null) {
            if(getBy.equals("state.origin")) {
                res.put("origin",id);
            } else if(getBy.equals("state.parent")) {
                res.put("parent",id);
            }
        }

        res["limit"] = limit;
        res["offset"] = offset;
        res["sortBy"] = sortBy;
        res["sortOrder"] = sortOrder;

        return res;
    }

    itemResultOfError(error, object, message) {
        let binder = {};
        binder["state"] = ItemState.UNDEFINED;
        binder["haveCopy"] = false;
        binder["createdAt"] = new Date();
        binder["expiresAt"] = new Date();
        let errorRecords = [];
        //errorRecords.add(new ErrorRecord(error,object,message));
        binder["errors"] = errorRecords;
        return new ItemResult(binder);
    }

    approve(params, session) {

    }

    approveParcel(params, session) {

    }

    startApproval(params, session) {
       /* if (this.config === null || this.config.limitFreeRegistrations())
            if(this.config === null || (
                !this.config.keysWhiteList.contains(session.publicKey) &&
                !this.config.addressesWhiteList.stream().anyMatch()addr => addr.isMatchingKey(session.publicKey))) {
                System.out.println("startApproval ERROR: session key shoild be in the white list");

                return Binder.of(
                    "itemResult", itemResultOfError(Errors.BAD_CLIENT_KEY,"startApproval", "command needs client key from whitelist"));
            }

        let n = asyncStarts.incrementAndGet();
        AtomicInteger k = new AtomicInteger();
        params.getListOrThrow("packedItems").forEach((item) ->
            es.execute(() -> {
                try {
                    checkNode(session);
                    System.out.println("Request to start registration #"+n+":"+k.incrementAndGet());
                    node.registerItem(Contract.fromPackedTransaction(((Bytes)item).toArray()));
                } catch (Exception e) {
                    e.printStackTrace();
                }
            })
        );

        //TODO: return ItemResult
        return new Binder();*/
    }

    getState(params, session) {
        this.checkNode(session, true);

        /*try {
            return Binder.of("itemResult",
                node.checkItem((HashId) params.get("itemId")));
        } catch (Exception e) {
            e.printStackTrace();
            System.out.println("getState ERROR: " + e.getMessage());
            return Binder.of(
                "itemResult", itemResultOfError(Errors.COMMAND_FAILED,"approveParcel", e.getMessage()));
        }*/

    }

    resyncItem(params, session) {
        this.checkNode(session, true);

        /*let tmpAddress = null;
        try {
            tmpAddress = new KeyAddress("JKEgDs9CoCCymD9TgmjG8UBLxuJwT5GZ3PaZyG6o2DQVGRQPjXHCG8JouC8eZw5Nd1w9krCS");
        } catch (KeyAddress.IllegalAddressException e) {
            e.printStackTrace();
        }

        if (config.limitFreeRegistrations())

            if(!(
                tmpAddress.isMatchingKey(session.getPublicKey()) ||
                config.getNetworkAdminKeyAddress().isMatchingKey(session.getPublicKey()) ||
                config.getKeysWhiteList().contains(session.getPublicKey()) ||
                config.getAddressesWhiteList().stream().anyMatch(addr -> addr.isMatchingKey(session.getPublicKey()))
            )) {
                System.out.println("approve ERROR: command needs client key from whitelist");

                return Binder.of(
                    "itemResult", itemResultOfError(Errors.BAD_CLIENT_KEY,"resyncItem", "command needs client key from whitelist"));
            }

        try {
            Binder result = Binder.of("itemResult",
                node.checkItem((HashId) params.get("itemId")));
            node.resync((HashId) params.get("itemId"));
            return result;
        } catch (Exception e) {
            System.out.println("getState ERROR: " + e.getMessage());
            return Binder.of(
                "itemResult", itemResultOfError(Errors.COMMAND_FAILED,"resyncItem", e.getMessage()));
        }*/
    }

    setVerbose(params, session) {

    }

    getStats(params, session) {
        this.checkNode(session, true);

        if (this.config === null || this.node === null || !(
            this.config.networkAdminKeyAddress.isMatchingKey(session.publicKey) ||
            this.node.myInfo.publicKey.equals(session.publicKey) ||
            this.config.keysWhiteList.contains(session.publicKey) || //TODO
            this.config.addressesWhiteList().stream().anyMatch(addr => addr.isMatchingKey(session.publicKey))
        )) {
            console.log("command needs admin key");
            return Binder.of(
                "itemResult", itemResultOfError(Errors.BAD_CLIENT_KEY,"getStats", "command needs admin key"));
        }
        return this.node.provideStats(params.getInt("showDays",null));
    }

    getParcelProcessingState(params, session) {

    }

    checkNode(session, checkKeyLimit = false) {
        // checking node
        if (!this.node) {
            throw new Error(Errors.NOT_READY + "please call again after a while");
        }

        if(this.node.isSanitating()) {
            //WHILE NODE IS SANITATING IT COMMUNICATES WITH THE OTHER NODES ONLY
            if(netConfig.toList().stream().anyMatch(nodeInfo => nodeInfo.publicKey.equals(session.publicKey)))
                return;

            throw new Error(Errors.NOT_READY + "please call again after a while");
        }

        // checking key limit
        if (checkKeyLimit)
            if (!this.node.checkKeyLimit(session.publicKey))
                throw new Error(Errors.COMMAND_FAILED +  "exceeded the limit of requests for key per minute, please call again after a while");
    }

    on(path, handler) {
        super.on(path, (request, response) => {
            if (localCors) {
                let hh = response.headers;
                hh["Access-Control-Allow-Origin"] =  "*";
                hh["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                hh["Access-Control-Allow-Headers"] = "DNT,X-CustomHeader,Keep-Alive,User-Age  nt,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range";
                hh["Access-Control-Expose-Headers"] = "DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range";
            }
            handler.handle(request, response);
        });
    }

    storageGetRate(params, session) {
        this.checkNode(session, true);

        return {U: Config.rate[NSmartContract.SmartContractType.SLOT1].toFixed()}
    }

    querySlotInfo(params, session) {
        this.checkNode(session, true);

        let slot_id = params.getBinary("slot_id");
        let slotBin = this.node.ledger.getSmartContractById(crypto.HashId.withDigest(slot_id));

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
        let slot_id = params.getBinary("slot_id");
        let origin_id = params.getBinary("origin_id");
        let contract_id = params.getBinary("contract_id");

        if ((origin_id === null) && (contract_id === null))
            throw new Error("invalid arguments (both origin_id and contract_id are null)");
        if ((origin_id !== null) && (contract_id !== null))
            throw new Error("invalid arguments (only one origin_id or contract_id is allowed)");
        let slotBin = node.getLedger().getSmartContractById(HashId.withDigest(slot_id));
        if (slotBin != null) {
            let slotContract = Contract.fromPackedTransaction(slotBin);
            if (contract_id !== null) {
                let contractHashId = crypto.HashId.withDigest(contract_id);
                res[contract] = this.node.ledger.getContractInStorage(contractHashId);
            } else if (origin_id != null) {
                let originHashId = crypto.HashId.withDigest(origin_id);
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

        let follower_id = params.getBinary("follower_id");
        let followerBin = this.node.ledger.getSmartContractById(crypto.HashId.withDigest(follower_id));

        if (followerBin !== null) {
            let followerContract =  Contract.fromPackedTransaction(followerBin);
            return {follower_state: followerContract.state.data};
        }
        return {follower_state: null};
    }

}

module.exports = {ClientHTTPServer};