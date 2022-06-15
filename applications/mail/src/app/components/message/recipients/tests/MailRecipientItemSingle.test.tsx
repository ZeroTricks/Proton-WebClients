import { Recipient } from '@proton/shared/lib/interfaces';
import { fireEvent, Matcher } from '@testing-library/dom';
import MailRecipientItemSingle from '../MailRecipientItemSingle';
import { render, tick } from '../../../../helpers/test/render';
import { GeneratedKey, generateKeys } from '../../../../helpers/test/crypto';
import { clearAll } from '../../../../helpers/test/helper';

const senderAddress = 'sender@outside.com';

const sender = {
    Name: 'sender',
    Address: senderAddress,
} as Recipient;

describe('MailRecipientItemSingle trust public key item in dropdown', () => {
    let senderKeys: GeneratedKey;

    beforeAll(async () => {
        senderKeys = await generateKeys('sender', senderAddress);
    });

    afterEach(clearAll);

    const openDropdown = async (
        getByTestId: (text: Matcher) => HTMLElement,
        getByText: (text: Matcher) => HTMLElement
    ) => {
        // Open the dropdown
        const recipientItem = getByTestId('message-header:from');
        fireEvent.click(recipientItem);
        await tick();

        // The dropdown must be open
        getByText('New message');
    };

    it('should not contain the trust key action in the dropdown', async () => {
        const { queryByText, getByTestId, getByText } = await render(<MailRecipientItemSingle recipient={sender} />);

        await openDropdown(getByTestId, getByText);

        // Trust public key dropdown item should not be found
        const dropdownItem = queryByText('Trust public key');
        expect(dropdownItem).toBeNull();
    });

    it('should contain the trust key action in the dropdown if signing key', async () => {
        const { getByTestId, getByText } = await render(
            <MailRecipientItemSingle recipient={sender} signingPublicKey={senderKeys.publicKeys[0]} />
        );

        await openDropdown(getByTestId, getByText);

        // Trust public key dropdown item should be found
        getByText('Trust public key');
    });

    it('should contain the trust key action in the dropdown if attached key', async () => {
        const { getByTestId, getByText } = await render(
            <MailRecipientItemSingle recipient={sender} attachedPublicKey={senderKeys.publicKeys[0]} />
        );

        await openDropdown(getByTestId, getByText);

        // Trust public key dropdown item should be found
        getByText('Trust public key');
    });
});