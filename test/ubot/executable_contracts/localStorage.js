/**
 * Example demonstrates local storage
 */

async function check() {
    await writeLocalStorage({info: 777});
    return (await getLocalStorage()).info;
}

async function reuse() {
    let ls = await getLocalStorage();

    await writeMultiStorage({storage: ls});
    return await getMultiStorage();
}