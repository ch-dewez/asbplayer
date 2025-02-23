import { CommandHandler } from '../command-handler';
import { SettingsProvider, ankiSettingsKeys, AnkiSettings } from '@project/common/settings';
import {
    addAnnotationsToStringArray,
    addAnnotationsToSubtitlesArray,
    Anki,
    findKnownWordsInText,
} from '@project/common/anki';
import { Command, AddAnnotationsMessage, Message, AddAnnotationsToStringArrayMessage } from '@project/common';

export default class AddAnnotationsToStringArrayHandler implements CommandHandler {
    readonly sender = 'parser';
    readonly command = 'add-annotations-to-string-array';

    private readonly _settingsProvider: SettingsProvider;

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
    }

    handle(
        command: Command<Message>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        const { texts } = command.message as AddAnnotationsToStringArrayMessage;
        this._settingsProvider
            .get(ankiSettingsKeys)
            .then((settings) => {
                return addAnnotationsToStringArray(texts, settings);
            })
            .then((response) => {
                sendResponse(response);
            })
            .catch((err) => {
                console.error(err);
                sendResponse({ error: err.message ?? 'An unknown error occurred' });
            });

        return true;
    }
}
