BEGIN;

DO $$
DECLARE
    target_email text := 'samparkerpatterson@gmail.com';
    target_user_id bigint;
    target_map_id bigint;
BEGIN
    SELECT user_id
    INTO target_user_id
    FROM public.app_user
    WHERE lower(email) = lower(target_email);

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'No app_user row found for email %.', target_email;
    END IF;

    SELECT map_id
    INTO target_map_id
    FROM public.maps
    WHERE created_by = target_user_id
    ORDER BY map_id
    LIMIT 1;

    IF target_map_id IS NULL THEN
        INSERT INTO public.maps (
            name,
            description,
            created_by,
            location_name,
            latitude,
            longitude
        )
        VALUES (
            'Dummy LiDAR Test Map',
            'Map created for testing the database lidar browser.',
            target_user_id,
            'Test location',
            36.12,
            -97.07
        )
        RETURNING map_id INTO target_map_id;
    END IF;

    INSERT INTO public.lidar_data (
        file_location,
        file_format,
        uploaded_at,
        uploaded_by,
        latitude,
        longitude,
        map_id
    )
    VALUES
        (
            'dummy/lidar_sample_01.laz',
            'LAZ',
            CURRENT_TIMESTAMP,
            target_user_id,
            36.12,
            -97.07,
            target_map_id
        ),
        (
            'dummy/lidar_sample_02.las',
            'LAS',
            CURRENT_TIMESTAMP - INTERVAL '1 day',
            target_user_id,
            36.13,
            -97.08,
            target_map_id
        ),
        (
            'dummy/lidar_sample_03.laz',
            'LAZ',
            CURRENT_TIMESTAMP - INTERVAL '2 days',
            target_user_id,
            36.14,
            -97.09,
            target_map_id
        );
END
$$;

COMMIT;
