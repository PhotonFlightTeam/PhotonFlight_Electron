-- PhotonFlight endpoint procedure patch.
-- Apply after build_terrain_intelligence.sql, clerk_user_identity.sql,
-- lidar_file_storag.sql, and procedures.sql.

BEGIN;

-- Replaced endpoint write procedures

CREATE OR REPLACE PROCEDURE public.create_or_update_user(
    IN p_clerk_user_id TEXT,
    IN p_name TEXT,
    IN p_email TEXT,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_clerk_user_id IS NULL OR btrim(p_clerk_user_id) = '' THEN
        RAISE EXCEPTION 'Clerk user ID is required' USING ERRCODE = '22023';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
    END IF;

    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RAISE EXCEPTION 'email is required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.app_user AS t (clerk_user_id, name, email)
    VALUES (p_clerk_user_id, btrim(p_name), btrim(p_email))
    ON CONFLICT (clerk_user_id) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email
    RETURNING to_jsonb(t) INTO p_row;
END;
$$;

CREATE OR REPLACE PROCEDURE public.create_lidar_upload(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_file_location TEXT,
    IN p_file_format TEXT,
    IN p_file_data BYTEA,
    IN p_content_type TEXT,
    IN p_sha256 TEXT,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_file_size BIGINT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.maps
    WHERE map_id = p_map_id AND created_by = p_user_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_file_location IS NULL OR btrim(p_file_location) = '' THEN
        RAISE EXCEPTION 'file_location is required' USING ERRCODE = '22023';
    END IF;

    IF p_file_format IS NULL OR upper(p_file_format) NOT IN ('LAS', 'LAZ') THEN
        RAISE EXCEPTION 'File format must be LAS or LAZ'
            USING ERRCODE = '22023';
    END IF;

    IF p_file_data IS NULL OR octet_length(p_file_data) = 0 THEN
        RAISE EXCEPTION 'LiDAR file data is required'
            USING ERRCODE = '22023';
    END IF;

    IF octet_length(p_file_data) > 100 * 1024 * 1024 THEN
        RAISE EXCEPTION 'LiDAR file is too large'
            USING ERRCODE = '22023';
    END IF;

    IF octet_length(p_file_data) < 4
       OR get_byte(p_file_data, 0) <> 76
       OR get_byte(p_file_data, 1) <> 65
       OR get_byte(p_file_data, 2) <> 83
       OR get_byte(p_file_data, 3) <> 70 THEN
        RAISE EXCEPTION 'File does not have a LAS/LAZ header'
            USING ERRCODE = '22023';
    END IF;

    IF p_content_type IS NULL
       OR p_content_type NOT IN (
           'application/vnd.las',
           'application/vnd.laszip',
           'application/octet-stream'
       ) THEN
        RAISE EXCEPTION 'Unsupported LiDAR content type'
            USING ERRCODE = '22023';
    END IF;

    IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-fA-F]{64}$' THEN
        RAISE EXCEPTION 'SHA-256 must contain 64 hexadecimal characters'
            USING ERRCODE = '22023';
    END IF;

    v_file_size := octet_length(p_file_data);

    INSERT INTO public.lidar_data AS t (
        map_id,
        uploaded_by,
        file_location,
        file_format,
        file_data,
        content_type,
        file_size_bytes,
        sha256
    )
    VALUES (
        p_map_id,
        p_user_id,
        p_file_location,
        upper(p_file_format),
        p_file_data,
        p_content_type,
        v_file_size,
        lower(p_sha256)
    )
    RETURNING to_jsonb(t) INTO p_row;
END;
$$;

-- Allow picture and LiDAR updates to move records between maps owned by the
-- authenticated user.

CREATE OR REPLACE PROCEDURE public.update_picture(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_picture_id BIGINT,
    IN p_file_location TEXT,
    IN p_capture_time TIMESTAMP WITHOUT TIME ZONE,
    IN p_width_px INTEGER,
    IN p_height_px INTEGER,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_file_location IS NULL OR btrim(p_file_location) = '' THEN
        RAISE EXCEPTION 'file_location is required' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.maps
    WHERE map_id = p_map_id AND created_by = p_user_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.picture AS t
    SET map_id = p_map_id,
        file_location = p_file_location,
        capture_time = p_capture_time,
        width_px = p_width_px,
        height_px = p_height_px
    WHERE t.picture_id = p_picture_id
      AND EXISTS (
          SELECT 1
          FROM public.maps AS m
          WHERE m.map_id = t.map_id
            AND m.created_by = p_user_id
      )
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Picture not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.update_lidar(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_lidar_id BIGINT,
    IN p_file_location TEXT,
    IN p_file_format TEXT,
    IN p_latitude DOUBLE PRECISION,
    IN p_longitude DOUBLE PRECISION,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM 1
    FROM public.maps
    WHERE map_id = p_map_id AND created_by = p_user_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.lidar_data AS t
    SET map_id = p_map_id,
        file_location = p_file_location,
        file_format = p_file_format,
        latitude = p_latitude,
        longitude = p_longitude
    WHERE t.lidar_id = p_lidar_id
      AND EXISTS (
          SELECT 1
          FROM public.maps AS m
          WHERE m.map_id = t.map_id
            AND m.created_by = p_user_id
      )
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lidar not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- Full anomaly creation/update procedures cover status and verification fields
-- that are accepted by the current API schemas.

CREATE OR REPLACE PROCEDURE public.create_anomaly_full(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_anomaly_type TEXT,
    IN p_description TEXT DEFAULT NULL,
    IN p_lidar_id BIGINT DEFAULT NULL,
    IN p_latitude DOUBLE PRECISION DEFAULT NULL,
    IN p_longitude DOUBLE PRECISION DEFAULT NULL,
    IN p_status TEXT DEFAULT 'suspected',
    IN p_verification_status TEXT DEFAULT 'pending',
    IN p_verification_picture_id BIGINT DEFAULT NULL,
    INOUT p_anomaly_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_anomaly_type IS NULL OR btrim(p_anomaly_type) = '' THEN
        RAISE EXCEPTION 'Anomaly type is required' USING ERRCODE = '22023';
    END IF;

    IF p_verification_status IS NULL
       OR p_verification_status NOT IN ('pending', 'confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Invalid verification status'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.maps
    WHERE map_id = p_map_id AND created_by = p_user_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_lidar_id IS NOT NULL THEN
        PERFORM 1
        FROM public.lidar_data
        WHERE lidar_id = p_lidar_id AND map_id = p_map_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'LiDAR data must belong to the same map'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_verification_picture_id IS NOT NULL THEN
        PERFORM 1
        FROM public.picture
        WHERE picture_id = p_verification_picture_id
          AND map_id = p_map_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verification picture must belong to the same map'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.anomalies (
        map_id,
        anomaly_type,
        description,
        lidar_id,
        latitude,
        longitude,
        status,
        verification_status,
        verification_picture_id
    )
    VALUES (
        p_map_id,
        p_anomaly_type,
        p_description,
        p_lidar_id,
        p_latitude,
        p_longitude,
        COALESCE(p_status, 'suspected'),
        p_verification_status,
        p_verification_picture_id
    )
    RETURNING anomaly_id INTO p_anomaly_id;
END;
$$;

CREATE OR REPLACE PROCEDURE public.update_anomaly_full(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_anomaly_id BIGINT,
    IN p_anomaly_type TEXT,
    IN p_description TEXT,
    IN p_lidar_id BIGINT,
    IN p_latitude DOUBLE PRECISION,
    IN p_longitude DOUBLE PRECISION,
    IN p_status TEXT,
    IN p_verification_status TEXT,
    IN p_verification_picture_id BIGINT,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_anomaly_type IS NULL OR btrim(p_anomaly_type) = '' THEN
        RAISE EXCEPTION 'anomaly_type is required' USING ERRCODE = '22023';
    END IF;

    IF p_verification_status IS NULL
       OR p_verification_status NOT IN ('pending', 'confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Invalid verification status'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.maps
    WHERE map_id = p_map_id AND created_by = p_user_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_lidar_id IS NOT NULL THEN
        PERFORM 1
        FROM public.lidar_data
        WHERE lidar_id = p_lidar_id AND map_id = p_map_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'LiDAR data must belong to the same map'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_verification_picture_id IS NOT NULL THEN
        PERFORM 1
        FROM public.picture
        WHERE picture_id = p_verification_picture_id
          AND map_id = p_map_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verification picture must belong to the same map'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.anomalies AS t
    SET map_id = p_map_id,
        anomaly_type = p_anomaly_type,
        description = p_description,
        lidar_id = p_lidar_id,
        latitude = p_latitude,
        longitude = p_longitude,
        status = COALESCE(p_status, 'suspected'),
        verification_status = p_verification_status,
        verification_picture_id = p_verification_picture_id
    WHERE t.anomaly_id = p_anomaly_id
      AND EXISTS (
          SELECT 1
          FROM public.maps AS m
          WHERE m.map_id = t.map_id
            AND m.created_by = p_user_id
      )
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anomaly not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

COMMIT;
