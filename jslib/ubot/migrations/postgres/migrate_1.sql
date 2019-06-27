create table table1(
    id serial primary key,
    hash bytea not null
);

create unique index ix_table1_hash on table1(hash);
