-- PhotonFlight write procedures.
-- p_user_id comes from the authenticated backend.
-- Updates replace editable fields. NULL clears a nullable field.
-- Foreign keys prevent deleting rows that are still referenced.

BEGIN;

-- Maps

CREATE OR REPLACE PROCEDURE public.create_map(
    IN p_user_id BIGINT,
    IN p_name TEXT,
    IN p_description TEXT DEFAULT NULL,
    IN p_location_name TEXT DEFAULT NULL,
    IN p_latitude DOUBLE PRECISION DEFAULT NULL,
    IN p_longitude DOUBLE PRECISION DEFAULT NULL,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.maps AS t (
        name, description, location_name, latitude, longitude, created_by
    )
    VALUES (
        p_name, p_description, p_location_name, p_latitude, p_longitude, p_user_id
    )
    RETURNING to_jsonb(t) INTO p_row;
END;
$$;

CREATE OR REPLACE PROCEDURE public.update_map(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_name TEXT,
    IN p_description TEXT,
    IN p_location_name TEXT,
    IN p_latitude DOUBLE PRECISION,
    IN p_longitude DOUBLE PRECISION,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.maps AS t
    SET name = p_name,
        description = p_description,
        location_name = p_location_name,
        latitude = p_latitude,
        longitude = p_longitude
    WHERE t.map_id = p_map_id
      AND t.created_by = p_user_id
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.delete_map(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.maps AS t
    WHERE t.map_id = p_map_id
      AND t.created_by = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- Drones

CREATE OR REPLACE PROCEDURE public.create_drone(
    IN p_user_id BIGINT,
    IN p_name TEXT,
    IN p_type TEXT DEFAULT NULL,
    IN p_serial_number TEXT DEFAULT NULL,
    IN p_status TEXT DEFAULT NULL,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.drone AS t (name, type, serial_number, status, user_id)
    VALUES (p_name, p_type, p_serial_number, p_status, p_user_id)
    RETURNING to_jsonb(t) INTO p_row;
END;
$$;

CREATE OR REPLACE PROCEDURE public.update_drone(
    IN p_user_id BIGINT,
    IN p_drone_id BIGINT,
    IN p_name TEXT,
    IN p_type TEXT,
    IN p_serial_number TEXT,
    IN p_status TEXT,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.drone AS t
    SET name = p_name,
        type = p_type,
        serial_number = p_serial_number,
        status = p_status
    WHERE t.drone_id = p_drone_id
      AND t.user_id = p_user_id
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Drone not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.delete_drone(
    IN p_user_id BIGINT,
    IN p_drone_id BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.drone AS t
    WHERE t.drone_id = p_drone_id
      AND t.user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Drone not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- Pictures

CREATE OR REPLACE PROCEDURE public.create_picture(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_file_location TEXT,
    IN p_capture_time TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    IN p_width_px INTEGER DEFAULT NULL,
    IN p_height_px INTEGER DEFAULT NULL,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
    END IF;

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

    INSERT INTO public.picture AS t (
        file_location, capture_time, width_px, height_px, map_id, uploaded_by
    )
    VALUES (
        p_file_location, p_capture_time, p_width_px, p_height_px, p_map_id, p_user_id
    )
    RETURNING to_jsonb(t) INTO p_row;
END;
$$;

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
    SET file_location = p_file_location,
        capture_time = p_capture_time,
        width_px = p_width_px,
        height_px = p_height_px
    WHERE t.picture_id = p_picture_id
      AND t.map_id = p_map_id
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Picture not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.delete_picture(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_picture_id BIGINT
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

    DELETE FROM public.picture AS t
    WHERE t.picture_id = p_picture_id
      AND t.map_id = p_map_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Picture not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- LiDAR

CREATE OR REPLACE PROCEDURE public.create_lidar(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_file_location TEXT DEFAULT NULL,
    IN p_file_format TEXT DEFAULT NULL,
    IN p_latitude DOUBLE PRECISION DEFAULT NULL,
    IN p_longitude DOUBLE PRECISION DEFAULT NULL,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
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

    INSERT INTO public.lidar_data AS t (
        file_location, file_format, latitude, longitude, map_id, uploaded_by
    )
    VALUES (
        p_file_location, p_file_format, p_latitude, p_longitude, p_map_id, p_user_id
    )
    RETURNING to_jsonb(t) INTO p_row;
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
    SET file_location = p_file_location,
        file_format = p_file_format,
        latitude = p_latitude,
        longitude = p_longitude
    WHERE t.lidar_id = p_lidar_id
      AND t.map_id = p_map_id
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lidar not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.delete_lidar(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_lidar_id BIGINT
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

    DELETE FROM public.lidar_data AS t
    WHERE t.lidar_id = p_lidar_id
      AND t.map_id = p_map_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lidar not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- Anomalies

CREATE OR REPLACE PROCEDURE public.create_anomaly(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_anomaly_type TEXT,
    IN p_description TEXT DEFAULT NULL,
    IN p_lidar_id BIGINT DEFAULT NULL,
    IN p_latitude DOUBLE PRECISION DEFAULT NULL,
    IN p_longitude DOUBLE PRECISION DEFAULT NULL,
    INOUT p_anomaly_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_anomaly_type IS NULL OR btrim(p_anomaly_type) = '' THEN
        RAISE EXCEPTION 'Anomaly type is required' USING ERRCODE = '22023';
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

    INSERT INTO public.anomalies (
        map_id, anomaly_type, description, lidar_id, latitude, longitude
    )
    VALUES (
        p_map_id, p_anomaly_type, p_description, p_lidar_id, p_latitude, p_longitude
    )
    RETURNING anomaly_id INTO p_anomaly_id;
END;
$$;

CREATE OR REPLACE PROCEDURE public.update_anomaly(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_anomaly_id BIGINT,
    IN p_anomaly_type TEXT,
    IN p_description TEXT,
    IN p_lidar_id BIGINT,
    IN p_latitude DOUBLE PRECISION,
    IN p_longitude DOUBLE PRECISION,
    IN p_status TEXT,
    INOUT p_row JSONB DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_anomaly_type IS NULL OR btrim(p_anomaly_type) = '' THEN
        RAISE EXCEPTION 'anomaly_type is required' USING ERRCODE = '22023';
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

    UPDATE public.anomalies AS t
    SET anomaly_type = p_anomaly_type,
        description = p_description,
        lidar_id = p_lidar_id,
        latitude = p_latitude,
        longitude = p_longitude,
        status = p_status
    WHERE t.anomaly_id = p_anomaly_id
      AND t.map_id = p_map_id
    RETURNING to_jsonb(t) INTO p_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anomaly not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.delete_anomaly(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_anomaly_id BIGINT
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

    DELETE FROM public.anomalies AS t
    WHERE t.anomaly_id = p_anomaly_id
      AND t.map_id = p_map_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anomaly not found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE public.review_anomaly(
    p_anomaly_id BIGINT,
    p_user_id BIGINT,
    p_decision TEXT,
    p_picture_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_map_id BIGINT;
    v_verification_status TEXT;
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be confirmed or rejected'
            USING ERRCODE = '22023';
    END IF;

    SELECT a.map_id, a.verification_status
    INTO v_map_id, v_verification_status
    FROM public.anomalies AS a
    JOIN public.maps AS m ON m.map_id = a.map_id
    WHERE a.anomaly_id = p_anomaly_id
      AND m.created_by = p_user_id
    FOR UPDATE OF a;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anomaly not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_verification_status <> 'pending' THEN
        RAISE EXCEPTION 'Anomaly has already been reviewed' USING ERRCODE = '55000';
    END IF;

    IF p_picture_id IS NOT NULL THEN
        PERFORM 1
        FROM public.picture
        WHERE picture_id = p_picture_id
          AND map_id = v_map_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verification picture must belong to the same map'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.anomalies
    SET verification_status = p_decision,
        verification_picture_id = COALESCE(p_picture_id, verification_picture_id)
    WHERE anomaly_id = p_anomaly_id;
END;
$$;

CREATE OR REPLACE PROCEDURE public.save_detection_batch(
    IN p_user_id BIGINT,
    IN p_map_id BIGINT,
    IN p_detections JSONB,
    INOUT p_anomaly_ids BIGINT[] DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_detection RECORD;
    v_anomaly_id BIGINT;
BEGIN
    IF jsonb_typeof(p_detections) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Detections must be a JSON array' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_detections) = 0 THEN
        RAISE EXCEPTION 'Detections array must contain at least one item'
            USING ERRCODE = '22023';
    END IF;

    p_anomaly_ids := ARRAY[]::BIGINT[];

    FOR v_detection IN
        SELECT *
        FROM jsonb_to_recordset(p_detections) AS detection (
            anomaly_type TEXT,
            description TEXT,
            lidar_id BIGINT,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION
        )
    LOOP
        CALL public.create_anomaly(
            p_user_id,
            p_map_id,
            v_detection.anomaly_type,
            v_detection.description,
            v_detection.lidar_id,
            v_detection.latitude,
            v_detection.longitude,
            v_anomaly_id
        );

        p_anomaly_ids := array_append(p_anomaly_ids, v_anomaly_id);
    END LOOP;
END;
$$;

COMMIT;