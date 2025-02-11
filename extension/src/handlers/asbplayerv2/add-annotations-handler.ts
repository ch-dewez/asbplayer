import { CommandHandler } from '../command-handler';
import { SettingsProvider, ankiSettingsKeys, AnkiSettings } from '@project/common/settings';
import { addAnnotationsToSubtitlesArray, Anki, findKnownWordsInText } from '@project/common/anki';
import { Command, AddAnnotationsMessage, Message } from '@project/common';

export default class AddAnnotationsHandler implements CommandHandler {
    readonly sender = 'player';
    readonly command = 'add-annotations';

    private readonly _settingsProvider: SettingsProvider;

    constructor(settingsProvider: SettingsProvider) {
        this._settingsProvider = settingsProvider;
    }

    handle(command: Command<Message>, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean {
        const { subtitles } = command.message as AddAnnotationsMessage;
        if (subtitles[0].annotations !== undefined && subtitles[0].annotations.length > 0) {
            sendResponse({ subtitles: subtitles });
            return true;
        }
        this._settingsProvider.get(ankiSettingsKeys)
        .then((settings) => {
            return addAnnotationsToSubtitlesArray(subtitles, settings);
        })
        .then((response) => {
            sendResponse({ subtitles: subtitles });
        })
        .catch((err) => {
            console.error(err);
            sendResponse({ error: err.message ?? 'An unknown error occurred' });
        });

        return true;
    }
}