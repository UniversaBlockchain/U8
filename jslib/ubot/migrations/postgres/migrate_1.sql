create table pool_storage(
    id bigserial primary key,
    pool_hash_id bytea not null,
    executable_contract_id bytea not null,
    storage_name text not null,
    single_storage_data bytea not null,
    UNIQUE (pool_hash_id)
);


create table pool_storage_multi(
    id bigserial primary key,
    pool_storage_id bigint references pool_storage(id) on delete cascade,
    ubot_number int not null,
    storage_data bytea not null,
    UNIQUE (pool_storage_id,ubot_number)
);
