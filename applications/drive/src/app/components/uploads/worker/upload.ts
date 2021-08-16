import { serializeFormData } from '@proton/shared/lib/fetch/helpers';

import { STATUS_CODE, RESPONSE_CODE } from '../../../constants';
import { MAX_UPLOAD_JOBS, MAX_RETRIES_BEFORE_FAIL } from '../constants';
import { UploadingBlock } from './interface';
import { Pauser } from './utils';

/**
 * startUploadJobs starts MAX_UPLOAD_JOBS jobs to read uploading blocks
 * and upload the date to the backend.
 */
export default async function startUploadJobs(
    pauser: Pauser,
    generator: AsyncGenerator<UploadingBlock>,
    progressCallback: (progress: number) => void,
    uploadBlockDataCallbcak = uploadBlockData
) {
    const promises: Promise<void>[] = [];
    for (let idx = 0; idx < MAX_UPLOAD_JOBS; idx++) {
        promises.push(startUploadJob(pauser, generator, progressCallback, uploadBlockDataCallbcak));
    }
    return Promise.all(promises);
}

async function startUploadJob(
    pauser: Pauser,
    generator: AsyncGenerator<UploadingBlock>,
    progressCallback: (progress: number) => void,
    uploadBlockDataCallbcak = uploadBlockData
) {
    for await (const block of generator) {
        await pauser.waitIfPaused();
        await uploadBlock(block, pauser, progressCallback, uploadBlockDataCallbcak);
    }
}

async function uploadBlock(
    block: UploadingBlock,
    pauser: Pauser,
    progressCallback: (progress: number) => void,
    uploadBlockDataCallbcak = uploadBlockData,
    numRetries = 0
): Promise<void> {
    let progress = 0;
    const onProgress = (relativeIncrement: number) => {
        const increment = Math.ceil(block.originalSize * relativeIncrement);
        if (increment !== 0) {
            progress += increment;
            progressCallback(increment);
        }
    };
    const resetProgress = () => {
        if (progress !== 0) {
            progressCallback(-progress);
        }
        progress = 0;
    };

    try {
        await uploadBlockDataCallbcak(block.uploadLink, block.encryptedData, onProgress, pauser.abortController.signal);
    } catch (err: any | XHRError) {
        resetProgress();

        if (pauser.isPaused) {
            await pauser.waitIfPaused();
            return uploadBlock(block, pauser, progressCallback, uploadBlockDataCallbcak, 0);
        }

        // Upload can be cancelled at the moment when the block is already
        // committed on the backend side, but from the client point of view
        // the request was cancelled. When we attempt to upload again, we
        // get this error which we can ignore and consider it uploaded.
        if (err.errorCode === RESPONSE_CODE.ALREADY_EXISTS) {
            return;
        }

        if (err.statusCode !== STATUS_CODE.NOT_FOUND && numRetries < MAX_RETRIES_BEFORE_FAIL) {
            console.warn(`Failed block #${block.index} upload. Retry num: ${numRetries}`);
            return uploadBlock(block, pauser, progressCallback, uploadBlockDataCallbcak, numRetries + 1);
        }

        throw err;
    }
}

async function uploadBlockData(
    url: string,
    content: Uint8Array,
    onProgress: (relativeIncrement: number) => void,
    signal: AbortSignal
) {
    let listener: () => void;

    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new Error('Upload aborted'));
            return;
        }

        const xhr = new XMLHttpRequest();

        let lastLoaded = 0;
        let total = 0;
        xhr.upload.onprogress = (e) => {
            total = e.total;
            onProgress((e.loaded - lastLoaded) / total);
            lastLoaded = e.loaded;
        };

        listener = () => {
            // When whole block is uploaded, we mustn't cancel even if we don't get a response
            if (!total || lastLoaded !== total) {
                xhr.abort();
                reject(new Error('Upload aborted'));
            }
        };
        signal.addEventListener('abort', listener);

        xhr.onload = async () => {
            if (xhr.status >= STATUS_CODE.OK && xhr.status < STATUS_CODE.BAD_REQUEST) {
                resolve();
            } else {
                reject(new XHRError(xhr.response?.Error || xhr.statusText, xhr.response?.Code, xhr.status));
            }
        };

        xhr.responseType = 'json';
        xhr.upload.onerror = () => {
            // onerror provides ProgressEvent, not any error.
            // It can happen when internet is down, for example.
            // On this place would be good to pause the progress instead.
            reject(new Error('Upload interrupted'));
        };
        xhr.onerror = () => {
            // onerror provides ProgressEvent, not any error.
            // It can happen when browser blocks the request, for example.
            reject(new Error('Upload failed'));
        };
        xhr.open('POST', url);
        xhr.send(
            serializeFormData({
                Block: new Blob([content]),
            })
        );
    }).finally(() => {
        if (listener) {
            signal.removeEventListener('abort', listener);
        }
    });
}

class XHRError extends Error {
    errorCode: number; // API error code.

    statusCode: number; // XHR status code.

    constructor(message: string, code: number, status: number) {
        super(message);
        this.errorCode = code;
        this.statusCode = status;
    }
}
