import { CommandHandler } from '../command-handler';
import { SettingsProvider, ankiSettingsKeys, AnkiSettings } from '@project/common/settings';
import { findKnownWordsInText } from '@project/common/anki';
import { Command, FindKnownWordsMessage, Message } from '@project/common';

export default class FindKnownWordsHandler implements CommandHandler {
    readonly sender = 'asbplayer-extension-to-video';
    readonly command = 'find-known-words';

    private readonly _settingsProvider: SettingsProvider;

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
    }

    async handle(command: Command<Message>, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<boolean> {
        const { text } = command.message as FindKnownWordsMessage;

        try {
            const ankiSettings = (await this._settingsProvider.get(ankiSettingsKeys)) as AnkiSettings;
            const knownWords = await findKnownWordsInText(text, ankiSettings);
            sendResponse({ knownWords });
        } catch (e) {
            console.error(e);
            if (e instanceof Error) {
                sendResponse({ error: e.message });
            } else {
                sendResponse({ error: 'An unknown error occurred' });
            }
        }

        return true;
    }
}