async function writeStorage(single_data, multi_data, storageName = "default") {
    await writeSingleStorage(single_data, storageName);
    await writeMultiStorage(multi_data, storageName);
}

async function readStorage(storageName = "default") {
    return {
        single_data: (await getSingleStorage(storageName)).result,
        multi_data: await getMultiStorage(storageName)
    };
}

/*async function writeStorage(data, storageName = "default", multi = false) {
    if (multi)
        await writeMultiStorage(data, storageName);
    else
        await writeSingleStorage(data, storageName);
}

async function readStorage(storageName = "default", multi = false) {
    if (multi)
        return await getMultiStorage(storageName);
    else
        return await getSingleStorage(storageName);
}*/