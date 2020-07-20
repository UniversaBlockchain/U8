/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as io from 'io'

const ex = require("exceptions");

const MIN_CONFIRMED_RATIO = 0.4;
const CONFIRMED_QUORUM_RATIO = 0.9;

class TopologyBuilder {
    constructor() {
        // TOPOLOGY_DIR = System.getProperty("user.home")+"/.universa/topology/";

        this.topology = null;
        this.version = null;
        // this.cachedFile = null;
        // this.reacquireDone = null;
        //
        // this.knownKeys = new t.GenericSet();
        // this.nodeCoordinates = new t.GenericMap();
        // this.confirmedKeys = new t.GenericSet();
        // this.processedKeys = new t.GenericSet();
    }

    static extractTopologyFromFileData(data) {
        let result = JSON.parse(data);
        if (result instanceof Array)
            return {
                list: result,
                updated: 0
            };
        else
            return result;
    }

    async build(topologyInput, topologyCacheDir) {
        // TODO: use topologyCacheDir, check cached (and resource) topology
        // if (topologyCacheDir == null)
        //     throw new Error("topology dir (default) is not defined");
        //
        // if (!topologyCacheDir.endsWith("/"))
        //     topologyCacheDir += "/";

        let topology = null;

        if (await io.isAccessible(topologyInput) && await io.isFile(topologyInput)) {
            let providedTopology = TopologyBuilder.extractTopologyFromFileData(await io.fileGetContentsAsString(topologyInput));
            if (topology == null || t.getOrDefault(providedTopology, "updated", 0) > t.getOrDefault(topology, "updated", 0))
                topology = providedTopology;
        }

        if (topology == null)
            throw new ex.IllegalArgumentError("Topology is not provided/not found in cache or resources");

        this.topology = topology.list;

        // TODO: check topology

        return this;
    }

}

module.exports = {TopologyBuilder};