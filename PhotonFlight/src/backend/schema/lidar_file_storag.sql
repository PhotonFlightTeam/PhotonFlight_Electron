-- Example only: stores LAS/LAZ bytes in PostgreSQL.
-- Existing metadata rows remain valid with file_data NULL; new uploads should
-- populate file_data and file_size_bytes together.

ALTER TABLE public.lidar_data
    ADD COLUMN file_data bytea,
    ADD COLUMN content_type character varying(100),
    ADD COLUMN file_size_bytes bigint,
    ADD COLUMN sha256 character varying(64);

ALTER TABLE public.lidar_data
    ADD CONSTRAINT lidar_data_file_data_size_check
        CHECK (
            (file_data IS NULL AND file_size_bytes IS NULL)
            OR
            (
                file_data IS NOT NULL
                AND file_size_bytes = octet_length(file_data)
                AND file_size_bytes > 0
            )
        ),
    ADD CONSTRAINT lidar_data_sha256_check
        CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-fA-F]{64}$'),
    ADD CONSTRAINT lidar_data_content_type_check
        CHECK (
            content_type IS NULL
            OR content_type IN (
                'application/vnd.las',
                'application/vnd.laszip',
                'application/octet-stream'
            )
        );

-- Compute sha256 in the application when uploading and verify it after
-- retrieving the bytes. This schema checks its format, not its correctness.
