create table storage(
    id bigserial primary key,
    executable_contract_id bytea not null,
    storage_name text not null,
    storage_type int not null,
    UNIQUE (executable_contract_id, storage_name, storage_type)
);

create table single_records(
    record_id bytea not null,
    storage_id bigint references storage(id) on delete cascade,
    storage_data bytea,
    hash bytea not null,
    storage_ubots bytea,
    UNIQUE (record_id, storage_id)
);

create table multi_records(
    record_id bytea not null,
    storage_id bigint references storage(id) on delete cascade,
    ubot_number int not null,
    storage_data bytea,
    hash bytea not null,
    storage_ubots bytea,
    UNIQUE (record_id, ubot_number, storage_id)
);

create index ix_single_records on single_records(storage_id);
create index ix_single_records_hash on single_records(hash);
create unique index ix_single_record on single_records(record_id, storage_id);
create index ix_multi_records on multi_records(storage_id);
create unique index ix_multi_record on multi_records(record_id, ubot_number, storage_id);
create index ix_multi_records_hash on multi_records(hash);