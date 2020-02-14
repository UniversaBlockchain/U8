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