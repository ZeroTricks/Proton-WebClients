import {
    checkKeysInSKL,
    importKeys,
    ktSentryReport,
    verifyLatestProofOfAbsence,
    verifySKLSignature,
} from '@proton/key-transparency/lib';
import { APP_NAMES, KEY_FLAG } from '@proton/shared/lib/constants';
import { hasBit } from '@proton/shared/lib/helpers/bitset';
import { AddressKey, Api, FetchedSignedKeyList, KeyMigrationKTVerifier } from '@proton/shared/lib/interfaces';

import { KT_FF, isKTActive } from './ktStatus';

const createKeyMigrationKTVerifier = (
    getFF: () => Promise<KT_FF>,
    api: Api,
    appName: APP_NAMES
): KeyMigrationKTVerifier => {
    return async (email: string, keysList: AddressKey[], signedKeyList: FetchedSignedKeyList | null) => {
        const featureFlag = await getFF();
        if (!(await isKTActive(appName, featureFlag))) {
            return;
        }
        try {
            if (signedKeyList?.Data && signedKeyList?.Signature) {
                const keysWithFlag = await importKeys(keysList);
                await checkKeysInSKL(keysWithFlag, signedKeyList.Data);
                const verificationKeys = keysWithFlag
                .filter(({ Flags }) => hasBit(Flags, KEY_FLAG.FLAG_NOT_COMPROMISED))
                .map(({ PublicKey }) => PublicKey);
                await verifySKLSignature(
                    verificationKeys,
                    signedKeyList.Data,
                    signedKeyList.Signature,
                    'KeyMigrationKTVerifier'
                );
            } else {
                await verifyLatestProofOfAbsence(api, email);
            }
        } catch (error: any) {
            ktSentryReport('Key migration checks failed', {
                context: 'KeyMigrationKTVerifier',
                error: error.message,
            });
            return;
        }
    };
};

export default createKeyMigrationKTVerifier;
