const FINISHED_WITH_ERROR = new Set(['OPERATION_STATE_FAILED', 'OPERATION_STATE_CANCELLED']);
const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

export function loadDataset({ client, events, filePath, signal }) {
  return new Promise((resolve, reject) => {
    let operationId = null;
    let settled = false;
    const early = [];

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      events.off('event', onEvent);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());

    const checkOperation = async (snapshot) => {
      try {
        const operation = await client.getOperation({ operation_id: operationId });
        if (operation.state === 'OPERATION_STATE_SUCCEEDED' && snapshot.active_dataset) {
          finish(resolve, snapshot.active_dataset);
        } else if (FINISHED_WITH_ERROR.has(operation.state)) {
          finish(reject, new Error(operation.error?.message || operation.message || 'Dataset import failed'));
        }
      } catch (error) {
        finish(reject, error);
      }
    };

    const handle = (event) => {
      if (event.payload === 'dataset_loaded' && event.dataset_loaded?.operation_id === operationId) {
        finish(resolve, event.dataset_loaded.dataset);
      } else if (event.payload === 'operation_progress' && event.operation_progress?.operation?.id === operationId) {
        const operation = event.operation_progress.operation;
        if (FINISHED_WITH_ERROR.has(operation.state)) {
          finish(reject, new Error(operation.error?.message || operation.message || 'Dataset import failed'));
        }
      } else if (event.payload === 'core_snapshot') {
        void checkOperation(event.core_snapshot);
      }
    };

    function onEvent(event) {
      if (settled) return;
      if (operationId === null) early.push(event);
      else handle(event);
    }

    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    events.on('event', onEvent);

    client.loadDataSet(filePath).then(({ operation }) => {
      if (settled) return;
      if (!operation?.id) throw new Error('PhotonCore did not return a load operation ID.');
      operationId = operation.id;
      for (const event of early.splice(0)) handle(event);
    }).catch((error) => finish(reject, error));
  });
}

export function streamDataset({ client, dataset, send, signal, batchPoints = 16384 }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve(); return; }

    send('core:point-stream-start', { dataset });
    if (Number(dataset.point_count) === 0) {
      send('core:point-stream-end', {});
      resolve();
      return;
    }

    const stream = client.streamPoints({
      dataset_id: dataset.id,
      revision: dataset.revision,
      preferred_batch_points: batchPoints,
    });
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      stream.cancel();
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = () => {
      done = true;
      signal?.removeEventListener('abort', onAbort);
    };

    const bytes = (value) => (value?.length ? value : null);
    stream.on('data', (batch) => {
      if (done) return;
      send('core:point-batch', {
        revision: batch.revision,
        pointOffset: Number(batch.point_offset),
        pointCount: batch.point_count,
        positions: batch.positions_f32_le,
        colors: bytes(batch.colors_rgb_u8),
        intensities: bytes(batch.intensities_u16_le),
        classifications: bytes(batch.classifications_u8),
      });
    });
    stream.on('end', () => {
      if (done) return;
      settle();
      send('core:point-stream-end', {});
      resolve();
    });
    stream.on('error', (error) => {
      if (done) return;
      settle();
      send('core:point-stream-error', { message: error.details || error.message, code: error.code });
      reject(error);
    });
  });
}
