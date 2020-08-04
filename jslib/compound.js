/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {HashId} from 'crypto'

const roles = require('roles');
const ex = require("exceptions");
const Contract = require("contract").Contract;
const Constraint = require('constraint').Constraint;
const TransactionPack = require("transactionpack").TransactionPack;
const t = require("tools");

class Compound {
    static TYPE = "universa_compound";
    static VERSION = 1;

    constructor() {}

    /**
     * Create a compound contract, nested contracts can be added to.
     *
     * There are two possible usages of compound contract technique.
     * First is registering multiple contracts in single transaction, saving time and reducing U cost.
     * Second is adding signatures to compound contract that will affect nested contracts without changing their binaries/IDs.
     *
     * @return {Compound} created Compound.
     */
    static async init() {
        let compound = new Compound();
        compound.compoundContract = new Contract();

        let expires = new Date();
        expires.setDate(expires.getDate() + 14); // 14 days
        compound.compoundContract.setExpiresAt(expires);

        //in order ot create roles without keys we create dummy reference and add it as required for the roles
        let dummyConstraint = new Constraint(compound.compoundContract);
        dummyConstraint.name = "dummy";
        let conditions = {};
        conditions[Constraint.conditionsModeType.any_of] = ["this.state.parent undefined"];
        dummyConstraint.setConditions(conditions);
        compound.compoundContract.addConstraint(dummyConstraint);

        let issuer = new roles.SimpleRole("issuer", null, compound.compoundContract);
        issuer.requiredAllConstraints.add("dummy");
        compound.compoundContract.registerRole(issuer);

        compound.compoundContract.registerRole(new roles.RoleLink("creator", "issuer", compound.compoundContract));
        compound.compoundContract.registerRole(new roles.RoleLink("owner", "issuer", compound.compoundContract));

        compound.compoundContract.definition.data.type = Compound.TYPE;
        compound.compoundContract.definition.data.version = Compound.VERSION;
        compound.compoundContract.definition.data.contracts = {};

        await compound.compoundContract.seal(true);

        return compound;
    }

    /**
     * Create Compound from compound contract.
     *
     * @param {Contract} compoundContract - Unpacked compound contract.
     * @return {Compound} created Compound.
     */
    static async fromCompoundContract(compoundContract) {
        let compound = await Compound.init();
        compound.compoundContract = compoundContract;

        let type = t.getOrDefault(compoundContract.definition.data, "type", "");
        if (type !== Compound.TYPE)
            throw new ex.IllegalArgumentError("Invalid 'definition.data.type':'" + type + "', expected:'" + Compound.TYPE + "'");

        let version = t.getOrDefault(compoundContract.definition.data, "version", 999999);
        if (version > Compound.VERSION)
            throw new ex.IllegalArgumentError("'definition.data.version':'" + version + "' is not supported. Maximum supported version is " + Compound.VERSION);

        return compound;
    }

    /**
     * Create Compound from packed transaction of compound contract.
     *
     * @param {Uint8Array} packedTransaction - Packed transaction with compound contract.
     * @return {Compound} created Compound.
     */
    static async fromPackedTransaction(packedTransaction) {
        return await Compound.fromCompoundContract(await Contract.fromPackedTransaction(packedTransaction));
    }

    /**
     * Returns compound that holds a contract with given ID (if exists).
     *
     * @param {HashId} contractInPack - Id of a contract held by compound.
     * @param {TransactionPack} transactionPack - Transaction pack to look into.
     * @return {Compound} compound if exists or null otherwise.
     */
    static async getHoldingCompound(contractInPack, transactionPack) {
        let compoundContract = transactionPack.findContract(
            c => Array.from(c.newItems).some(ni => ni.id.equals(contractInPack)));

        if (compoundContract != null && compoundContract.definition.data.type.equals(Compound.TYPE))
            return await Compound.fromCompoundContract(compoundContract);
        else
            return null;
    }

    /**
     * Add contract to Compound. Contract and its data will later be accessible by its tag.
     *
     * Note: contract returned by {@see #getContractByTag(tag)} has reconstructed transaction pack
     * with referenced items include
     *
     * @param {string} tag - String associated with contract being added.
     * @param {Contract} contractToPutInto - Contract being added.
     * @param {Object} dataToAssociateWith - Data object associated with contract being added.
     */
    async addContract(tag, contractToPutInto, dataToAssociateWith) {
        this.compoundContract.newItems.add(contractToPutInto);

        try {
            //make a copy of contract transaction
            contractToPutInto = await Contract.fromPackedTransaction(await contractToPutInto.getPackedTransaction());
        } catch (e) {
            throw new ex.IllegalArgumentError(e);
        }

        let tagObj = {};
        let referencedItems = Array.from(contractToPutInto.transactionPack.referencedItems.values());
        let tpTags = contractToPutInto.transactionPack.taggedItems;

        tagObj.id = contractToPutInto.id.base64;
        tagObj.data = dataToAssociateWith;
        tagObj.refs = referencedItems.map(ri => ri.id.base64);

        let tpTaggedItems = {};
        tpTags.forEach((k, v) => tpTaggedItems.put(k, v.id.base64));
        tagObj.tags = tpTaggedItems;

        this.compoundContract.definition.data.contracts[tag] = tagObj;

        await this.compoundContract.seal();

        referencedItems.forEach(ri => this.compoundContract.transactionPack.addReferencedItem(ri));
    }

    /**
     * Get contract from Compound by id.
     *
     * @param {HashId} contractId - Id of a contract in compound.
     * @return {Contract} contract found.
     */
    async getContractById(contractId) {
        let tagsBinder = this.compoundContract.definition.data.contracts;
        let tags = Object.keys(tagsBinder);

        for (let tag of tags)
            if (HashId.withBase64Digest(tagsBinder[tag].id).equals(contractId))
                return await this.getContractByTag(tag);

        return null;
    }

    /**
     * Get contract from Compound by tag
     *
     * @param {String} tag - String to find contract by
     * @return {Contract} contract found
     */
    async getContractByTag(tag) {
        try {
            // get binder for tag specified
            let tagObj = this.compoundContract.definition.data.contracts[tag];
            if (tagObj == null)
                return null;

            // We make a copy of transaction and extract everything from the copy (possibly breaking its internal structure)
            // to keep the actual one untouched
            let tpCopy = await TransactionPack.unpack(await this.compoundContract.getPackedTransaction());

            //get contract by id and create transaction pack for it
            let id = HashId.withBase64Digest(tagObj.id);
            let contract = tpCopy.subItems.get(id);

            let tp = new TransactionPack(contract);
            contract.transactionPack = tp;

            // fill tp referenced items from "refs"
            let referencedItemsIds = t.getOrDefault(tagObj, "refs", []);
            referencedItemsIds.forEach(riId => tp.addReferencedItem(tpCopy.referencedItems.get(HashId.withBase64Digest(riId))));

            // fill tp tags from "tags"
            let tpTags = t.getOrDefault(tagObj, "tags", {});
            for (let [k, v] of Object.entries(tpTags))
                tp.addTag(k, HashId.withBase64Digest(v));

            return contract;

        } catch (e) {
            return null;
        }
    }

    /**
     * Get contract associated data from Compound by tag
     *
     * @param {string} tag - String to find data by
     * @return {Object} contract associated data
     */
    getData(tag) {
        return this.compoundContract.definition.data.contracts[tag].data;
    }

    /**
    * Get tags from Compound
    *
    * @return {Array<string>} tags
    */
    getTags() {
        return Object.keys(this.compoundContract.definition.data.contracts);
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Compound};