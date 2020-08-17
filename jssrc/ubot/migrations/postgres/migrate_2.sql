create table local_records(
    record_id bytea not null,
    storage_id bigint references storage(id) on delete cascade,
    storage_data bytea,
    UNIQUE (record_id, storage_id)
);