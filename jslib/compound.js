/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {HashId} from 'crypto'

const roles = require('roles');
const ex = require("exceptions");
const Contract = require("contract").Contract;

class Compound {
    static TYPE = "universa_compound";
    static VERSION = 1;

    constructor(compoundContract) {
        this.compoundContract = compoundContract;
    }

    /**
     * Create Compound from compound contract.
     *
     * @param {Contract} compoundContract - Unpacked compound contract.
     */
    fromCompoundContract(compoundContract) {
        this.compoundContract = compoundContract;

        let type = compoundContract.definition.data.type;
        if (type !== Compound.TYPE) {
            throw new ex.IllegalArgumentError("Invalid 'definition.data.type':'"+type+"', expected:'"+Compound.TYPE+"'");
        }

        let version = compoundContract.definition.data.getInt("version",999999);
        if (version > Compound.VERSION) {
            throw new ex.IllegalArgumentError("'definition.data.version':'"+version+"' is not supported. Maximum supported version is " + Compound.VERSION);
        }
    }

    /**
     * Create Compound from packed transaction of compound contract.
     *
     * @param packedTransaction
     */
    fromPackedTransaction(packedTransaction) {
        (Contract.fromPackedTransaction(packedTransaction));
    }

    /**
     * Create a compound contract, nested contracts can be added to.
     *
     * There are two possible usages of compound contract technique.
     * First is registering multiple contracts in single transaction, saving time and reducing U cost.
     * Second is adding signatures to compound contract that will affect nested contracts without changing their binaries/IDs.
     */
    Compound() {
        this.compoundContract = new Contract();

        let expires = new Date();
        expires.setDate(expires.getDate() + 14); // 14 days
        this.compoundContract.setExpiresAt(expires);

        //in order ot create roles without keys we create dummy reference and add it as required for the roles
        let dummyConstraint = new Constraint(this.compoundContract);
        dummyConstraint.name = "dummy";
        dummyConstraint.setConditions(Binder.of("any_of", Do.listOf("this.state.parent undefined")));
        this.compoundContract.addConstraint(dummyConstraint);

        let issuer = new roles.SimpleRole("issuer", this.compoundContract);
        issuer.addRequiredReference("dummy", roles.Role.RequiredMode.ALL_OF); //TODO
        this.compoundContract.addRole(issuer);

        this.compoundContract.addRole(new roles.RoleLink("creator", this.compoundContract, "issuer"));
        this.compoundContract.addRole(new roles.RoleLink("owner", this.compoundContract, "issuer"));

        this.compoundContract.definition.data.type = Compound.TYPE;
        this.compoundContract.definition.data.version = Compound.VERSION;

        this.compoundContract.definition.data.contracts = new Binder();

        this.compoundContract.seal();
    }

    /**
     * Returns compound that holds a contract with given ID (if exists).
     *
     * @param {HashId} contractInPack - Id of a contract held by compound.
     * @param {TransactionPack} transactionPack - Transaction pack to look into.
     * @return {Compound} compound if exists of {@code null} otherwise.
     */
    getHoldingCompound(contractInPack, transactionPack) {
        let compoundContract = transactionPack.findContract(  // TODO add findContract
            c => c.newItems.stream().filter(ni => ni.id.equals(contractInPack)).findAny().isPresent());

        if (compoundContract != null && compoundContract.definition.data.type.equals(Compound.TYPE)) {
            return new this.fromCompoundContract(compoundContract);
        } else {
            return null;
        }
    }

    /**
     * Add contract to Compound. Contract and its data will later be accessible by its tag.
     *
     * Note: contract returned by {@link #getContract(String)} has reconstructed transaction pack
     * with referenced items include
     *
     * @param {string} tag - String associated with contract being added.
     * @param {Contract} contractToPutInto - Contract being added.
     * @param dataToAssociateWith binder associated with contract being added.
     */
    addContract(tag, contractToPutInto, dataToAssociateWith) {
        this.compoundContract.newItems.add(contractToPutInto);

        try {
            //make a copy of contract transaction
            contractToPutInto = Contract.fromPackedTransaction(contractToPutInto.getPackedTransaction());
        } catch (e) {
            throw new ex.IllegalArgumentError(e);
        }

        let tagBinder = {};

        let referencedItems = contractToPutInto.transactionPack.referencedItems.values();
        let tpTags = contractToPutInto.transactionPack.taggedItems;

        tagBinder.id = contractToPutInto.id.base64;
        tagBinder.data = dataToAssociateWith;
        tagBinder.refs = referencedItems.stream().map(ri => ri.id.base64).collect(Collectors.toList());

        let tpTagsBinder = {};
       // tpTags.forEach((k, v) =>  tpTagsBinder.put(k, v.id.base64));

        tagBinder.tags = tpTagsBinder;

        this.compoundContract.definition.data.contracts.put(tag, tagBinder); //TODO

        this.compoundContract.seal();

        referencedItems.forEach(ri => this.compoundContract.transactionPack.addReferencedItem(ri));
    }

    /**
     * Get contract from Compound by id.
     *
     * @param {HashId} contractId - Id of a contract in compound.
     * @return {Contract}contract found.
     */
    getContractById(contractId) {
        let tagsBinder = this.compoundContract.definition.data.contracts;

        let tags = tagsBinder.keySet();
        for(let tag of tags) {
            let id = HashId.withBase64Digest(tagsBinder.getBinder(tag).getString("id"));
            if(id.equals(contractId)) {
                return this.getContractByTag(tag);
            }
        }
        return null;
    }

    /**
     * Get contract from Compound by tag
     *
     * @param tag string to find contract by
     * @return contract found
     */
    getContractByTag(tag) {
        ///*try {
            //get binder for tag specified
            let tagBinder = this.compoundContract.definition.data.contracts.tag;
            if(tagBinder == null)
                return null;

            //We make a copy of transaction and extract everything from the copy (possibly breaking its internal structure)
            //to keep the actual one untouched
            let tpCopy = TransactionPack.unpack(this.compoundContract.getPackedTransaction());

            //get contract by id and create transaction pack for it
            let id = HashId.withDigest(tagBinder.id);
            let contract = tpCopy.subItems.id;

          /*  let transactionPack = new TransactionPack(contract);
            contract.setTransactionPack(transactionPack);

            //fill tp referenced items from refs
            List<String> referencedItemsIds = tagBinder.getList("refs", new ArrayList<>());
            referencedItemsIds.forEach(riId =>transactionPack.addReferencedItem(
                tpCopy.getReferencedItems().get(HashId.withDigest(riId))));

            //fill tp tags from "tags"
            Binder tpTagsBinder = tagBinder.getBinder("tags",new Binder());
            tpTagsBinder.forEach((k,v)->transactionPack.addTag(k,HashId.withDigest((String) v)));

            return contract;

        } catch (ignored) {
            return null;
        } catch (e) {
            return null;
        } catch (e) {
            e.printStackTrace();
            return null;
        }*/
    }

    /**
     * Get contract associated data from Compound by tag
     *
     * @param tag string to find data by
     * @return contract associated data
     */
    getData(tag) {
        let tagBinder = this.compoundContract.definition.data.contracts.tag;
        return tagBinder.data;
    }

    /**
    * Get tags from Compound
    *
    * @return tags
    */
    getTags() {
        return this.compoundContract.definition.data.contracts; //TODO
    }

}

