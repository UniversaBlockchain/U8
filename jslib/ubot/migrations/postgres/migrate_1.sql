create table pool_storage(
    id bigserial primary key,
    pool_hash_id bytea not null,
    executable_contract_id bytea not null,
    storage_name text not null,
    storage_type int not null,
    single_storage_data bytea,
    UNIQUE (pool_hash_id, storage_name, storage_type)
);

create table pool_storage_multi(
    id bigserial primary key,
    pool_storage_id bigint references pool_storage(id) on delete cascade,
    ubot_number int not null,
    storage_data bytea not null,
    UNIQUE (pool_storage_id, ubot_number)
);

create unique index ix_pool_storage_hashes on pool_storage(pool_hash_id, storage_name, storage_type);
create unique index ix_pool_storage_multi_ids on pool_storage_multi(pool_storage_id);