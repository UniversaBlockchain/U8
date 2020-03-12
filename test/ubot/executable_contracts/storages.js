async function writeStorages(singleData, multiData, storageName) {
    await writeSingleStorage(singleData, storageName);
    await writeMultiStorage(multiData, storageName);
}

async function readStorages(storageName) {
    return {
        single_data: await getSingleStorage(storageName),
        multi_data: await getMultiStorage(storageName)
    };
}

async function parallelWriteStorages(singleDataArray, multiDataArray) {
    let promises = [];
    let index = 0;
    for (let sd of singleDataArray) {
        promises.push(writeSingleStorage(sd, "parallelStorage" + index));
        index++;
    }

    index = 0;
    for (let md of multiDataArray) {
        promises.push(writeMultiStorage(md, "parallelStorage" + index));
        index++;
    }

    await Promise.all(promises);
}

async function parallelReadStorages(countStorages) {
    let promises = [];
    for (let i = 0; i < countStorages; i++) {
        promises.push(getSingleStorage("parallelStorage" + i));
        promises.push(getMultiStorage("parallelStorage" + i));
    }

    return await Promise.all(promises);
}