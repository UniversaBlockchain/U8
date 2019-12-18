#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot0user;
	ALTER USER ubot0user with encrypted password 'uniPass';
	CREATE DATABASE ubot0db;
	GRANT ALL PRIVILEGES ON DATABASE ubot0db TO ubot0user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot1user;
	ALTER USER ubot1user with encrypted password 'uniPass';
	CREATE DATABASE ubot1db;
	GRANT ALL PRIVILEGES ON DATABASE ubot1db TO ubot1user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot2user;
	ALTER USER ubot2user with encrypted password 'uniPass';
	CREATE DATABASE ubot2db;
	GRANT ALL PRIVILEGES ON DATABASE ubot2db TO ubot2user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot3user;
	ALTER USER ubot3user with encrypted password 'uniPass';
	CREATE DATABASE ubot3db;
	GRANT ALL PRIVILEGES ON DATABASE ubot3db TO ubot3user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot4user;
	ALTER USER ubot4user with encrypted password 'uniPass';
	CREATE DATABASE ubot4db;
	GRANT ALL PRIVILEGES ON DATABASE ubot4db TO ubot4user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubo54user;
	ALTER USER ubot5user with encrypted password 'uniPass';
	CREATE DATABASE ubot5db;
	GRANT ALL PRIVILEGES ON DATABASE ubot5db TO ubot5user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot6user;
	ALTER USER ubot6user with encrypted password 'uniPass';
	CREATE DATABASE ubot6db;
	GRANT ALL PRIVILEGES ON DATABASE ubot6db TO ubot6user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot7user;
	ALTER USER ubot7user with encrypted password 'uniPass';
	CREATE DATABASE ubot7db;
	GRANT ALL PRIVILEGES ON DATABASE ubot7db TO ubot7user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot8user;
	ALTER USER ubot8user with encrypted password 'uniPass';
	CREATE DATABASE ubot8db;
	GRANT ALL PRIVILEGES ON DATABASE ubot8db TO ubot8user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot9user;
	ALTER USER ubot9user with encrypted password 'uniPass';
	CREATE DATABASE ubot9db;
	GRANT ALL PRIVILEGES ON DATABASE ubot9db TO ubot9user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot10user;
	ALTER USER ubot10user with encrypted password 'uniPass';
	CREATE DATABASE ubot10db;
	GRANT ALL PRIVILEGES ON DATABASE ubot10db TO ubot10user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot11user;
	ALTER USER ubot11user with encrypted password 'uniPass';
	CREATE DATABASE ubot11db;
	GRANT ALL PRIVILEGES ON DATABASE ubot11db TO ubot11user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot12user;
	ALTER USER ubot12user with encrypted password 'uniPass';
	CREATE DATABASE ubot12db;
	GRANT ALL PRIVILEGES ON DATABASE ubot12db TO ubot12user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot13user;
	ALTER USER ubot13user with encrypted password 'uniPass';
	CREATE DATABASE ubot13db;
	GRANT ALL PRIVILEGES ON DATABASE ubot13db TO ubot13user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot14user;
	ALTER USER ubot14user with encrypted password 'uniPass';
	CREATE DATABASE ubot14db;
	GRANT ALL PRIVILEGES ON DATABASE ubot14db TO ubot14user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER ubot15user;
	ALTER USER ubot15user with encrypted password 'uniPass';
	CREATE DATABASE ubot15db;
	GRANT ALL PRIVILEGES ON DATABASE ubot15db TO ubot15user;
EOSQL

touch /var/tmp/db_init_completed.lock