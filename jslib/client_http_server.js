import * as network from "./web";

const Main = require("main").Main;
const Boss = require("boss");
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const Config = require("config").Config;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const NNameRecord = require("services/NNameRecord").NNameRecord;

class ClientHTTPServer extends network.HttpServer {

    constructor(privateKey, port, logger) {
        super();
        this.log = logger;
        this.nodeKey = privateKey;

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
                result.number = this.node.getNumber();
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
            throw new IOException("invalid arguments");

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

        /*Binder res = new Binder();

        if (!node.getConfig().isPermanetMode())
            return res;

        HashId itemId = (HashId) params.get("itemId");

        byte[] body = node.getLedger().getKeepingItem(itemId);
        if (body != null) {
            res.put("packedContract", body);
            return res;
        }

        node.resync(itemId);
        ItemResult itemResult = node.checkItem(itemId);

        if (itemResult.state == ItemState.UNDEFINED)
            return res;

        Approvable item = node.getKeepingItemFromNetwork(itemId);
        if (item == null)
            return res;

        if ((item instanceof Contract) &&
            (item.getId().equals(itemId)) &&
            (HashId.of(((Contract) item).getLastSealedBinary()).equals(itemId))) {
            StateRecord record = node.getLedger().getRecord(itemId);
            node.getLedger().putKeepingItem(record, item);

            body = ((Contract) item).getPackedTransaction();
            res.put("packedContract", body);
        }*/

        return res;
    }

    getContract(params, session) {
        checkNode(session, true);

        /*Binder res = new Binder();

        if (!node.getConfig().isPermanetMode())
            return res;

        if(params.containsKey("origin") && params.containsKey("parent") || !params.containsKey("origin") && !params.containsKey("parent")) {
            throw new IllegalArgumentException("Invalid params. Should contain ether origin or parent");
        }

        HashId id = null;
        String getBy = null;
        if(params.containsKey("origin")) {
            id = (HashId) params.get("origin");
            if(id != null)
                getBy = "state.origin";
        }

        if(params.containsKey("parent")) {
            id = (HashId) params.get("parent");
            if(id != null)
                getBy = "state.parent";
        }

        int limit = params.getInt("limit", node.getConfig().getQueryContractsLimit());

        if (limit > node.getConfig().getQueryContractsLimit())
            limit = node.getConfig().getQueryContractsLimit();
        if (limit < 1)
            limit = 1;

        int offset = params.getInt("offset", 0);

        String sortBy = params.getString("sortBy", "");
        String sortOrder = params.getString("sortOrder", "DESC");


        Binder tags = params.getBinder("tags");

        Binder keeping = node.getLedger().getKeepingBy(getBy,id, tags, limit, offset,sortBy,sortOrder);
        if (keeping == null)
            return res;
        res.putAll(keeping);

        if(getBy != null) {
            if(getBy.equals("state.origin")) {
                res.put("origin",id);
            } else if(getBy.equals("state.parent")) {
                res.put("parent",id);
            }
        }

        res.put("limit",limit);
        res.put("offset",offset);
        res.put("sortBy",sortBy);
        res.put("sortOrder",sortOrder);*/

        return res;
    }

    itemResultOfError(error, object, message) {

    }

    approve(params, session) {

    }

    approveParcel(params, session) {

    }

    startApproval(params, session) {

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

    }

    setVerbose(params, session) {

    }

    getStats(params, session) {
        this.checkNode(session, true);

        if (this.config === null || this.node === null || !(
            this.config.networkAdminKeyAddress.isMatchingKey(session.publicKey) ||
            this.node.getNodeKey().equals(session.getPublicKey()) ||
            this.config.getKeysWhiteList().contains(session.getPublicKey()) ||
            this.config.getAddressesWhiteList().stream().anyMatch(addr => addr.isMatchingKey(session.getPublicKey()))
        )) {
            System.out.println("command needs admin key");
            return Binder.of(
                "itemResult", itemResultOfError(Errors.BAD_CLIENT_KEY,"getStats", "command needs admin key"));
        }
        return this.node.provideStats(params.getInt("showDays",null));
    }

    getParcelProcessingState(params, session) {

    }

    checkNode(session, checkKeyLimit = false) {
       /* // checking node
        if (node == null) {
            throw new CommandFailedException(Errors.NOT_READY, "", "please call again after a while");
        }

        if(node.isSanitating()) {
            //WHILE NODE IS SANITATING IT COMMUNICATES WITH THE OTHER NODES ONLY
            if(netConfig.toList().stream().anyMatch(nodeInfo -> nodeInfo.getPublicKey().equals(session.getPublicKey())))
                return;

            throw new CommandFailedException(Errors.NOT_READY, "", "please call again after a while");
        }

        // checking key limit
        if (checkKeyLimit)
            if (!node.checkKeyLimit(session.getPublicKey()))
                throw new CommandFailedException(Errors.COMMAND_FAILED, "", "exceeded the limit of requests for key per minute, please call again after a while");*/
    }

    on(path, handler) {  //TODO

    }

    storageGetRate(params, session) {

    }

    querySlotInfo(params, session) {

    }

    queryContract(params, session) {

    }

    followerGetRate(params, session) {
        this.checkNode(session, true);

        let rateOriginDays = Config.rate[NSmartContract.SmartContractType.FOLLOWER1];
        let rateCallback = Config.rate[NSmartContract.SmartContractType.FOLLOWER1 + ":callback"].div(rateOriginDays);

        let b = {};
        b["rateOriginDays"] = rateOriginDays.toFixed();
        b.put("rateCallback", rateCallback.toFixed());

        return b;
    }

    queryFollowerInfo(params, session) {

    }

}